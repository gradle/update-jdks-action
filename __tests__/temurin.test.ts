import { afterEach, describe, expect, it, jest } from '@jest/globals'
import { getLatestTemurinVersion, Jdk } from '../src/temurin'

const macX64 = (version: string): Jdk => ({
  os: 'macos',
  arch: 'amd64',
  vendor: 'temurin',
  version,
  sha256: 'old'
})

const eaAsset = (release_name: string, checksum: string): object => ({
  release_name,
  binaries: [{ image_type: 'jdk', package: { checksum } }]
})

function mockApi(
  ga: unknown,
  ea: unknown = []
): jest.SpiedFunction<typeof fetch> {
  return jest
    .spyOn(globalThis, 'fetch')
    .mockImplementation(async (input: string | URL | Request) => {
      const body = String(input).includes('/assets/latest/') ? ga : ea
      return new Response(JSON.stringify(body), { status: 200 })
    })
}

describe('getLatestTemurinVersion', () => {
  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('switches an EA entry to GA once GA is available', async () => {
    mockApi([
      { release_name: 'jdk-27+36', binary: { package: { checksum: 'ga' } } }
    ])

    expect(await getLatestTemurinVersion(macX64('jdk-27+30-ea-beta'))).toEqual({
      version: 'jdk-27+36',
      sha256: 'ga'
    })
  })

  it('updates an EA entry to the newest feature EA build without GA', async () => {
    const fetchMock = mockApi(
      [],
      [
        eaAsset('jdk27u-2026-11-07-17-08-beta', 'nightly'),
        eaAsset('jdk-27+34-ea-beta', 'b34'),
        eaAsset('jdk-27+35-ea-beta', 'b35'),
        eaAsset('jdk-28+1-ea-beta', 'other')
      ]
    )

    expect(await getLatestTemurinVersion(macX64('jdk-27+30-ea-beta'))).toEqual({
      version: 'jdk-27+35-ea-beta',
      sha256: 'b35'
    })
    expect(String(fetchMock.mock.calls[1][0])).toContain(
      '/v3/assets/feature_releases/27/ea?os=mac&architecture=x64&image_type=jdk'
    )
  })

  it('ignores update-branch nightlies', async () => {
    mockApi([], [eaAsset('jdk27u-2026-11-07-17-08-beta', 'nightly')])

    expect(
      await getLatestTemurinVersion(macX64('jdk-27+30-ea-beta'))
    ).toBeNull()
  })

  it('does not fall back to EA for a GA entry', async () => {
    const fetchMock = mockApi([], [eaAsset('jdk-27+35-ea-beta', 'b35')])

    expect(await getLatestTemurinVersion(macX64('jdk-27+36'))).toBeNull()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
