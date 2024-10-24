import * as core from '@actions/core'
import { GitHub } from '@actions/github/lib/utils'
import axios from 'axios'
import * as fs from 'fs'
import * as yaml from 'js-yaml'
import { Context as Ctx } from '@actions/github/lib/context'

import { context, getOctokit } from '@actions/github'
import { retry } from '@octokit/plugin-retry'

type GitHub = InstanceType<typeof GitHub> //eslint-disable-line no-redeclare
type Context = Ctx

function getGitHub(): GitHub {
  const token: string = core.getInput('token', { required: true })
  return getOctokit(token, retry)
}

class Jdk {
  constructor(
    public os: string,
    public arch: string,
    public vendor: string,
    public version: string,
    public sha256: string
  ) {}
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
      throw new Error(`Key '${key}' not found in the map ${map}`)
    })()
  )
}

export async function run(github: GitHub, context: Context): Promise<void> {
  try {
    const filePath = '.teamcity/jdks.yaml'
    const fileContents = fs.readFileSync(filePath, 'utf8')
    const data = yaml.load(fileContents) as any

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

    const updatedYaml = yaml.dump(data)
    fs.writeFileSync(filePath, updatedYaml, 'utf8')
    core.info('YAML file updated successfully')
  } catch (error) {
    core.setFailed(`Action failed with error: ${error}`)
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

async function getLatestTemurinVersion(jdk: Jdk): Promise<{ version: string; sha256: string }> {
  const majorVersion = extractMajorVersion(jdk.version)
  const targetArch = getOrError(ARCH_MAPPING, jdk.arch)
  const targetOs = getOrError(OS_MAPPING, jdk.os)
  const apiUrl = `https://api.adoptium.net/v3/assets/latest/${majorVersion}/hotspot?os=${targetOs}&architecture=${targetArch}`
  const response = await axios.get(apiUrl)

  const latestAsset = response.data[0]

  if (latestAsset) {
    return { version: latestAsset.release_name, sha256: latestAsset.binary.package.checksum }
  } else {
    throw new Error(`Failed to fetch the latest version for JDK ${majorVersion}`)
  }
}

run(getGitHub(), context)
