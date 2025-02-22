import { Fetcher, RequestOptions } from 'tcl-catalyst-commons'

require('isomorphic-form-data')

export function addModelToFormData(model: any, form: FormData, namespace = ''): FormData {
  for (const propertyName in model) {
    if (!model.hasOwnProperty(propertyName) || model[propertyName] === null || model[propertyName] === undefined)
      continue
    const formKey = namespace ? `${namespace}[${propertyName}]` : propertyName
    if (model[propertyName] instanceof Date) {
      form.append(formKey, model[propertyName].toISOString())
    } else if (model[propertyName] instanceof Array) {
      model[propertyName].forEach((element: any, index: number) => {
        const tempFormKey = `${formKey}[${index}]`
        addModelToFormData(element, form, tempFormKey)
      })
    } else if (typeof model[propertyName] === 'object') {
      addModelToFormData(model[propertyName], form, formKey)
    } else {
      form.append(formKey, model[propertyName].toString())
    }
  }
  return form
}

function removeDuplicates<T>(array: T[]): T[] {
  return Array.from(new Set(array))
}

/**
 * This method performs one or more fetches to the given server, splitting query params into different queries to avoid exceeding the max length of urls
 */
export const MAX_URL_LENGTH: number = 2048
export async function splitAndFetch<E>({
  baseUrl,
  path,
  queryParams,
  fetcher,
  uniqueBy,
  options
}: Omit<SplitAndFetchParams<E>, 'elementsProperty'>): Promise<E[]> {
  // Adding default
  fetcher = fetcher ?? new Fetcher()

  // Split values into different queries
  const queries = splitValuesIntoManyQueries({ baseUrl, path, queryParams })

  const results: Map<any, E> = new Map()
  for (const query of queries) {
    // Perform the different queries
    const elements: E[] = await fetcher.fetchJson(query, options)

    // Group by unique property (if set), or add all of them to the map
    elements.forEach((element) => results.set(uniqueBy ? element[uniqueBy] : results.size, element))
  }

  // Return results
  return Array.from(results.values())
}

const CHARS_LEFT_FOR_OFFSET = 7
/**
 * This method performs one or more fetches to the given server, splitting query params into different queries to avoid exceeding the max length of urls
 * This method should be used if the result is paginated, and needs to be queries many times
 */
export async function splitAndFetchPaginated<E>({
  fetcher,
  baseUrl,
  path,
  queryParams,
  elementsProperty,
  uniqueBy,
  options
}: RequiredOne<SplitAndFetchParams<E>, 'uniqueBy'>): Promise<E[]> {
  // A little clean up
  fetcher = fetcher ?? new Fetcher()
  const queryParamsMap: Map<string, string[]> =
    'name' in queryParams ? new Map([[queryParams.name, queryParams.values]]) : queryParams

  // Reserve a few chars to send the offset
  const reservedChars = `&offset=`.length + CHARS_LEFT_FOR_OFFSET

  // Split values into different queries
  const queries = splitValuesIntoManyQueries({ baseUrl, path, queryParams, reservedChars })

  // Perform the different queries
  const foundElements: Map<any, E> = new Map()
  let exit = false
  for (let i = 0; i < queries.length && !exit; i++) {
    const query = queries[i]
    let offset = 0
    let keepRetrievingElements = true
    while (keepRetrievingElements && !exit) {
      const url = query + (queryParamsMap.size === 0 ? '?' : '&') + `offset=${offset}`
      try {
        const response: {
          pagination: { offset: number; limit: number; moreData: boolean }
        } = await fetcher.fetchJson(url, options)
        const elements: E[] = response[elementsProperty]
        elements.forEach((element) => foundElements.set(element[uniqueBy], element))
        offset = response.pagination.offset + response.pagination.limit
        keepRetrievingElements = response.pagination.moreData
      } catch (error) {
        exit = true
      }
    }
  }

  return Array.from(foundElements.values())
}

export function splitValuesIntoManyQueryBuilders({
  queryParams,
  baseUrl,
  path,
  reservedChars
}: SplitIntoQueriesParams): QueryBuilder[] {
  const queryParamsMap: Map<string, string[]> =
    'name' in queryParams ? new Map([[queryParams.name, queryParams.values]]) : queryParams

  // Check that it makes sent to apply the algorithm
  if (queryParamsMap.size === 0) {
    return [new QueryBuilder(baseUrl + path, queryParamsMap, reservedChars)]
  }

  // Remove duplicates
  const withoutDuplicates: [string, string[]][] = Array.from(queryParamsMap.entries()).map(([name, values]) => [
    name,
    removeDuplicates(values)
  ])

  // Sort params by amount of values
  const sortedByValues: [string, string[]][] = withoutDuplicates.sort(
    ([_, values1], [__, values2]) => values1.length - values2.length
  )

  // Add all params (except the last one that is the one with the most values) into the url
  const defaultQueryBuilder = new QueryBuilder(baseUrl + path, new Map(), reservedChars)
  for (let i = 0; i < sortedByValues.length - 1; i++) {
    const [paramName, paramValues] = sortedByValues[i]
    if (!defaultQueryBuilder.canSetParams(paramName, paramValues)) {
      throw new Error(
        `This library can split one query param into many HTTP requests, but it can't split more than one. You will need to do that on the client side.`
      )
    }
    defaultQueryBuilder.setParams(paramName, paramValues)
  }

  // Prepare everything
  let queryBuilder = QueryBuilder.clone(defaultQueryBuilder)
  const [lastParamName, lastParamValues] = sortedByValues[sortedByValues.length - 1]
  const result: QueryBuilder[] = []

  for (const value of lastParamValues) {
    // Check url length
    if (!queryBuilder.canAddParam(lastParamName, value)) {
      result.push(queryBuilder)
      queryBuilder = QueryBuilder.clone(defaultQueryBuilder)
    }

    queryBuilder.addParam(lastParamName, value)
  }

  // Add current builder one last time
  result.push(queryBuilder)

  return result
}

export function splitValuesIntoManyQueries(parameters: SplitIntoQueriesParams): string[] {
  const builders = splitValuesIntoManyQueryBuilders(parameters)
  return builders.map((builder) => builder.toString())
}

export function convertFiltersToQueryParams(filters?: Record<string, any>): Map<string, string[]> {
  if (!filters) {
    return new Map()
  }
  const entries = Object.entries(filters)
    .filter(([_, value]) => !!value)
    .map<[string, string[]]>(([name, value]) => {
      const newName = name.endsWith('s') ? name.slice(0, -1) : name
      let newValues: string[]
      // Force coersion of number, boolean, or string into string
      if (Array.isArray(value)) {
        newValues = [...value].filter(isValidQueryParamValue).map((_) => `${_}`)
      } else if (isValidQueryParamValue(value)) {
        newValues = [`${value}`]
      } else {
        throw new Error(
          'Query params must be either a string, a number, a boolean or an array of the types just mentioned'
        )
      }
      return [newName, newValues]
    })
    .filter(([_, values]) => values.length > 0)
  return new Map(entries)
}

function isValidQueryParamValue(value: any): boolean {
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
}

/** Remove white spaces and add https if no protocol is specified */
export function sanitizeUrl(url: string): string {
  // Remove empty spaces
  url = url.trim()

  // Add protocol if necessary
  if (!url.startsWith('https://') && !url.startsWith('http://')) {
    url = 'https://' + url
  }

  // Remove trailing slash if present
  if (url.endsWith('/')) {
    url = url.slice(0, -1)
  }

  return url
}

type RequiredOne<T, K extends keyof T> = Omit<T, K> & Required<Pick<T, K>>

type QueryParams = { name: string; values: string[] } | Map<string, string[]>

type SplitIntoQueriesParams = {
  baseUrl: string
  path: string
  queryParams: QueryParams
  reservedChars?: number
}

type SplitAndFetchParams<E> = {
  baseUrl: string
  path: string
  queryParams: QueryParams
  elementsProperty: string
  fetcher?: Fetcher
  uniqueBy?: keyof E
  options?: RequestOptions
}

export class QueryBuilder {
  private length: number

  constructor(
    private readonly baseUrl: string,
    private readonly queryParams: Map<string, string[]> = new Map(),
    private readonly reservedChars: number = 0
  ) {
    this.length = this.baseUrl.length + reservedChars
    for (const [paramName, paramValues] of queryParams) {
      this.length += this.calculateAddedLength(paramName, paramValues)
    }
  }

  canAddParam(paramName: string, paramValue: string) {
    return this.length + paramName.length + paramValue.length + 2 < MAX_URL_LENGTH
  }

  addParam(paramName: string, paramValue: string) {
    if (!this.canAddParam(paramName, paramValue)) {
      throw new Error(`You can't add this parameter '${paramName}', since it would exceed the max url length`)
    }
    const values = this.queryParams.get(paramName) ?? []
    values.push(paramValue)
    this.queryParams.set(paramName, values)
    this.length += this.calculateAddedLength(paramName, [paramValue])
    return this
  }

  canSetParams(paramName: string, paramValues: any[]) {
    if (this.queryParams.has(paramName)) {
      const previousLength = this.calculateAddedLength(paramName, this.queryParams.get(paramName)!)
      const newLength = this.calculateAddedLength(paramName, paramValues)
      return this.length - previousLength + newLength < MAX_URL_LENGTH
    } else {
      const addedTotalLength = this.calculateAddedLength(paramName, paramValues)
      return this.length + addedTotalLength < MAX_URL_LENGTH
    }
  }

  /** This action will override whatever configuration there was previously for the given query parameter */
  setParams(paramName: string, paramValues: (string | number)[]) {
    if (!this.canSetParams(paramName, paramValues)) {
      throw new Error(`You can't add this parameter '${paramName}', since it would exceed the max url length`)
    }
    this.length += this.calculateAddedLength(paramName, paramValues)
    this.queryParams.set(
      paramName,
      paramValues.map((value) => `${value}`)
    )
    return this
  }

  /** This action will override whatever configuration there was previously for the given query parameter */
  setParam(paramName: string, paramValue: string | number) {
    this.setParams(paramName, [paramValue])
    return this
  }

  toString() {
    let url = this.baseUrl
    let addedParamAlready = false
    for (const [paramName, paramValues] of this.queryParams) {
      for (const paramValue of paramValues) {
        if (addedParamAlready) {
          url += `&${paramName}=${paramValue}`
        } else {
          url += `?${paramName}=${paramValue}`
          addedParamAlready = true
        }
      }
    }
    return url
  }

  static clone(queryBuilder: QueryBuilder): QueryBuilder {
    return new QueryBuilder(queryBuilder.baseUrl, new Map(queryBuilder.queryParams), queryBuilder.reservedChars)
  }

  private calculateAddedLength(paramName: string, paramValues: (string | number)[]) {
    const valuesLength = this.calculateArrayLength(paramValues)
    return valuesLength + (paramName.length + 2) * paramValues.length
  }

  private calculateArrayLength(array: (string | number)[]) {
    return array.map((value) => `${value}`).reduce((accum, curr) => accum + curr.length, 0)
  }
}
