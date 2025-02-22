import { EthAddress } from 'tcl-crypto'
import { Profile, Fetcher, RequestOptions, EntityMetadata, ServerMetadata } from 'tcl-catalyst-commons'
import { convertFiltersToQueryParams, sanitizeUrl, splitAndFetch, splitAndFetchPaginated } from './utils/Helper'
import {
  LambdasAPI,
  OwnedWearables,
  OwnedWearablesWithDefinition,
  OwnedWearablesWithoutDefinition,
  ProfileOptions,
  WearablesFilters
} from './LambdasAPI'
import { RUNNING_VERSION } from './utils/Environment'

export class LambdasClient implements LambdasAPI {
  private readonly lambdasUrl: string
  private readonly fetcher: Fetcher

  constructor(lambdasUrl: string, fetcher?: Fetcher) {
    this.lambdasUrl = sanitizeUrl(lambdasUrl)
    this.fetcher =
      fetcher ??
      new Fetcher({
        headers: {
          'User-Agent': `lambdas-client/${RUNNING_VERSION} (+https://github.com/telestoworld/catalyst-client)`
        }
      })
  }

  fetchProfiles(ethAddresses: EthAddress[], profileOptions?: ProfileOptions, options?: RequestOptions): Promise<Profile[]> {
    const queryParams: Map<string, string[]> = new Map()
    queryParams.set('id', ethAddresses)
    if (profileOptions?.fields) {
      const fieldsValue = profileOptions?.fields.getFields()
      queryParams.set('fields', [fieldsValue])
    }
    return splitAndFetch<Profile>({
      fetcher: this.fetcher,
      baseUrl: this.lambdasUrl,
      path: '/profiles',
      queryParams,
      options
    })
  }

  fetchWearables(filters: WearablesFilters, options?: RequestOptions): Promise<EntityMetadata[]> {
    const queryParams = convertFiltersToQueryParams(filters)
    if (queryParams.size === 0) {
      throw new Error('You must set at least one filter')
    }

    return splitAndFetchPaginated({
      fetcher: this.fetcher,
      baseUrl: this.lambdasUrl,
      path: '/collections/wearables',
      queryParams,
      uniqueBy: 'id',
      elementsProperty: 'wearables',
      options
    })
  }

  fetchOwnedWearables<B extends boolean>(
    ethAddress: EthAddress,
    includeDefinitions: B,
    options?: RequestOptions
  ): Promise<OwnedWearables<B>> {
    return splitAndFetch<B extends false ? OwnedWearablesWithoutDefinition : OwnedWearablesWithDefinition>({
      fetcher: this.fetcher,
      baseUrl: this.lambdasUrl,
      path: `/collections/wearables-by-owner/${ethAddress}`,
      queryParams: { name: 'includeDefinitions', values: [`${includeDefinitions}`] },
      options
    })
  }

  fetchCatalystsApprovedByDAO(options?: RequestOptions): Promise<ServerMetadata[]> {
    return this.fetcher.fetchJson(`${this.lambdasUrl}/contracts/servers`, options)
  }

  fetchLambdasStatus(options?: RequestOptions): Promise<{ contentServerUrl: string }> {
    return this.fetcher.fetchJson(`${this.lambdasUrl}/status`, options)
  }

  getLambdasUrl(): string {
    return this.lambdasUrl
  }
}
