/*
 * Copyright 2024 the original author or authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

export interface Jdk {
  os: string
  arch: string
  vendor: string
  version: string
  sha256: string
}

const OS_MAPPING: Map<string, string> = new Map([
  ['windows', 'windows'],
  ['linux', 'linux'],
  ['macos', 'mac']
])

const ARCH_MAPPING: Map<string, string> = new Map([
  ['amd64', 'x64'],
  ['aarch64', 'aarch64']
])

function getOrError(map: Map<string, string>, key: string): string {
  return (
    map.get(key) ||
    (() => {
      const keys = Array.from(map.keys()).join(', ')
      throw new Error(`Key '${key}' not found. Available keys: [${keys}]`)
    })()
  )
}

/*
[
  {
    "binary": {
      "architecture": "x64",
      "download_count": 15,
      "heap_size": "normal",
      "image_type": "debugimage",
      "jvm_impl": "hotspot",
      "os": "linux",
      "package": {
        "checksum": "b4dad70ce4206cbd6b4fd5e015be58e8b5c9f8a7f45edb91d8eeb6a156314148",
        "checksum_link": "https://github.com/adoptium/temurin8-binaries/releases/download/jdk8u432-b06/OpenJDK8U-debugimage_x64_linux_hotspot_8u432b06.tar.gz.sha256.txt",
        "download_count": 15,
        "link": "https://github.com/adoptium/temurin8-binaries/releases/download/jdk8u432-b06/OpenJDK8U-debugimage_x64_linux_hotspot_8u432b06.tar.gz",
        "metadata_link": "https://github.com/adoptium/temurin8-binaries/releases/download/jdk8u432-b06/OpenJDK8U-debugimage_x64_linux_hotspot_8u432b06.tar.gz.json",
        "name": "OpenJDK8U-debugimage_x64_linux_hotspot_8u432b06.tar.gz",
        "signature_link": "https://github.com/adoptium/temurin8-binaries/releases/download/jdk8u432-b06/OpenJDK8U-debugimage_x64_linux_hotspot_8u432b06.tar.gz.sig",
        "size": 157009949
      },
      "project": "jdk",
      "scm_ref": "jdk8u432-b06_adopt",
      "updated_at": "2024-10-18T12:59:11Z"
    },
    "release_link": "https://github.com/adoptium/temurin8-binaries/releases/tag/jdk8u432-b06",
    "release_name": "jdk8u432-b06",
    "vendor": "eclipse",
    "version": {
      "build": 6,
      "major": 8,
      "minor": 0,
      "openjdk_version": "1.8.0_432-b06",
      "security": 432,
      "semver": "8.0.432+6"
    }
  },
  ... ]
 */

function extractMajorVersion(jdkString: string): number {
  if (jdkString.startsWith('jdk8u')) {
    return 8
  }
  // jdk-23+30-ea-beta -> 23
  // jdk-21.0.3+9 -> 21
  const match = jdkString.match(/jdk-(\d+)/)
  if (!match) {
    throw new Error(`Major version not found in string: ${jdkString}`)
  }
  return parseInt(match[1], 10)
}

interface TemurinRelease {
  version: string
  sha256: string
}

async function fetchJson(apiUrl: string, majorVersion: number): Promise<any> {
  const response = await fetch(apiUrl)
  if (response.status === 404) {
    return null
  }
  if (!response.ok) {
    throw new Error(
      `Failed to fetch JDK ${majorVersion} from ${apiUrl}: ${response.statusText} ${await response.text()}`
    )
  }
  return response.json()
}

async function getLatestGaVersion(
  majorVersion: number,
  os: string,
  arch: string
): Promise<TemurinRelease | null> {
  const apiUrl = `https://api.adoptium.net/v3/assets/latest/${majorVersion}/hotspot?os=${os}&architecture=${arch}&image_type=jdk`
  const data = await fetchJson(apiUrl, majorVersion)

  if (!data || !data.length || !data[0]) {
    console.warn(
      `Invalid API Response for JDK ${majorVersion}: ${JSON.stringify(data)}`
    )
    return null
  }

  const latestAsset = data[0]

  if (!latestAsset.release_name || !latestAsset.binary?.package?.checksum) {
    console.warn(
      `Invalid asset structure for JDK ${majorVersion}: ${JSON.stringify(latestAsset)}`
    )
    return null
  }

  return {
    version: latestAsset.release_name,
    sha256: latestAsset.binary.package.checksum
  }
}

async function getLatestEaVersion(
  majorVersion: number,
  os: string,
  arch: string
): Promise<TemurinRelease | null> {
  const apiUrl = `https://api.adoptium.net/v3/assets/feature_releases/${majorVersion}/ea?os=${os}&architecture=${arch}&image_type=jdk&jvm_impl=hotspot&page_size=50&sort_order=DESC`
  const data = await fetchJson(apiUrl, majorVersion)
  // Skips update-branch nightlies such as jdk27u-2026-11-07-17-08-beta.
  const featureEa = new RegExp(`^jdk-${majorVersion}\\+(\\d+)-ea(-beta)?$`)

  let best: { build: number; release: TemurinRelease } | null = null
  for (const asset of Array.isArray(data) ? data : []) {
    const match = String(asset?.release_name).match(featureEa)
    const checksum = asset?.binaries?.find(
      (b: any) => b?.image_type === 'jdk' && b?.package?.checksum
    )?.package.checksum
    if (!match || !checksum) {
      continue
    }
    const build = parseInt(match[1], 10)
    if (!best || build > best.build) {
      best = {
        build,
        release: { version: asset.release_name, sha256: checksum }
      }
    }
  }
  return best?.release ?? null
}

export async function getLatestTemurinVersion(
  jdk: Jdk
): Promise<TemurinRelease | null> {
  const majorVersion = extractMajorVersion(jdk.version)
  const targetArch = getOrError(ARCH_MAPPING, jdk.arch)
  const targetOs = getOrError(OS_MAPPING, jdk.os)

  const ga = await getLatestGaVersion(majorVersion, targetOs, targetArch)
  if (ga !== null || !/-ea\b/.test(jdk.version)) {
    return ga
  }
  return getLatestEaVersion(majorVersion, targetOs, targetArch)
}
