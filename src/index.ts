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
import { getLatestTemurinVersion, Jdk } from './temurin'

interface JdksYaml {
  jdks: Jdk[]
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
        const result = await getLatestTemurinVersion(jdk)
        if (result === null) {
          core.warning(`No version data found for JDK ${jdk.version}`)
        } else if (jdk.version !== result.version) {
          core.info(`Updating ${jdk.version} to version ${result.version}`)
          jdk.version = result.version
          jdk.sha256 = result.sha256
          changesMade = true
        }
      }
    }

    if (!changesMade) {
      core.info('No updates found. Exiting.')
      return
    }

    const updatedYaml = yaml.dump(data, {
      quoteStyle: 'double',
      forceQuotes: true
    })
    fs.writeFileSync(filePath, updatedYaml, 'utf8')
    core.info('YAML file updated successfully')
  } catch (error: unknown) {
    core.setFailed(`Action failed with error: ${String(error)}`)
  }
}

run().catch(error => {
  console.error(error)
})
