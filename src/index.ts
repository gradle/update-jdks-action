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

import * as core from '@actions/core'
import * as fs from 'fs'
import * as yaml from 'js-yaml'

interface Jdk {
  os: string
  arch: string
  vendor: string
  version: string
  sha256: string
}

interface JdksYaml {
  jdks: Jdk[]
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

export async function run(): Promise<void> {
  try {
    const filePath = '.teamcity/jdks.yaml'
    const fileContents = fs.readFileSync(filePath, 'utf8')
    const data = yaml.load(fileContents) as JdksYaml

    let changesMade = false

    const jdks: Jdk[] = data.jdks
    for (const jdk of jdks) {
      console.log(`jdk: ${JSON.stringify(jdk)}`)
      if (jdk.vendor === 'temurin') {
        const { version, sha256 } = await getLatestTemurinVersion(jdk)
        if (jdk.version !== version) {
          core.info(`Updating ${jdk.version} to version ${version}`)
          jdk.version = version
          jdk.sha256 = sha256
          changesMade = true
        }
      }
    }

    if (!changesMade) {
      core.info('No updates found. Exiting.')
      return
    }

    const updatedYaml = yaml.dump(data, { quotingType: '"', forceQuotes: true })
    fs.writeFileSync(filePath, updatedYaml, 'utf8')
    core.info('YAML file updated successfully')
  } catch (error: unknown) {
    core.setFailed(`Action failed with error: ${String(error)}`)
  }
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

/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
async function getLatestTemurinVersion(
  jdk: Jdk
): Promise<{ version: string; sha256: string }> {
  const majorVersion = extractMajorVersion(jdk.version)
  const targetArch = getOrError(ARCH_MAPPING, jdk.arch)
  const targetOs = getOrError(OS_MAPPING, jdk.os)
  const apiUrl = `https://api.adoptium.net/v3/assets/latest/${majorVersion}/hotspot?os=${targetOs}&architecture=${targetArch}&image_type=jdk`

  // Using fetch instead of axios
  const response = await fetch(apiUrl)

  if (!response.ok) {
    throw new Error(
      `Failed to fetch the latest version for JDK ${majorVersion}: ${response.statusText} ${await response.text()}`
    )
  }

  const data = await response.json()
  const latestAsset = data[0]

  if (
    !latestAsset ||
    !latestAsset.release_name ||
    !latestAsset.binary?.package?.checksum
  ) {
    throw new Error(
      `Invalid data structure: expected release_name and binary.package.checksum in the response for JDK ${majorVersion}: ${JSON.stringify(data)}`
    )
  }

  return {
    version: latestAsset.release_name,
    sha256: latestAsset.binary.package.checksum
  }
}

run().catch(error => {
  console.error(error)
})
