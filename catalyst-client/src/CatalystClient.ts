import { EthAddress } from 'dcl-crypto'
import { FormData } from "form-data"
import { Fetcher, RequestOptions } from "../../catalyst-commons/src/utils/Fetcher";
import { Timestamp, ContentFile, Pointer, EntityType, Entity, EntityId, AuditInfo, ServerStatus, ServerName, ContentFileHash, DeploymentHistory, EntityMetadata } from "../../catalyst-commons/src/types";
import { Hashing } from "../../catalyst-commons/src/utils/Hashing";
import { retry } from "../../catalyst-commons/src/utils/Helper";
import { CatalystAPI } from "./CatalystAPI";
import { HistoryConsumer } from "./utils/HistoryConsumer";
import { convertModelToFormData } from './utils/Helper';
import { DeploymentData } from './utils/DeploymentBuilder';


export class CatalystClient implements CatalystAPI {

    private readonly catalystUrl: string

    constructor(catalystUrl: string, private readonly fetcher: Fetcher = new Fetcher()) {
        this.catalystUrl = CatalystClient.sanitizeUrl(catalystUrl)
    }

    async deployEntity(deployData: DeploymentData, fix: boolean = false, options?: RequestOptions): Promise<Timestamp> {
        const form = new FormData()
        form.append('entityId', deployData.entityId)
        convertModelToFormData(deployData.authChain, form, 'authChain')

        const alreadyUploadedHashes = await this.hashesAlreadyOnServer(Array.from(deployData.files.keys()))
        for (const [fileHash, file] of deployData.files) {
            if (!alreadyUploadedHashes.has(fileHash)) {
                form.append(file.name, file.content, { filename: file.name })
            }
        }

        return this.fetcher.postForm(`${this.catalystUrl}}/content/entities${fix ? '?fix=true' : ''}`, form, options)
    }

    getEntitiesByPointers(type: EntityType, pointers: Pointer[], options?: RequestOptions): Promise<Entity[]> {
        const filterParam = pointers.map(pointer => `pointer=${pointer}`).join("&")
        return this.fetchJson(`/content/entities/${type}?${filterParam}`, options)
    }

    getEntitiesByIds(type: EntityType, ids: EntityId[], options?: RequestOptions): Promise<Entity[]> {
        const filterParam = ids.map(id => `id=${id}`).join("&")
        return this.fetchJson(`/content/entities/${type}?${filterParam}`, options)
    }

    async getEntityById(type: EntityType, id: EntityId, options?: RequestOptions): Promise<Entity | undefined> {
        const entities: Entity[] = await this.getEntitiesByIds(type, [id], options)
        return entities[0]
    }

    getAuditInfo(type: EntityType, id: EntityId, options?: RequestOptions): Promise<AuditInfo> {
        return this.fetchJson(`/content/audit/${type}/${id}`, options)
    }

    getHistory(query?: {from?: Timestamp, to?: Timestamp, serverName?: ServerName}, options?: RequestOptions): Promise<DeploymentHistory> {
        return HistoryConsumer.consumeAllHistory(this.fetcher, `${this.catalystUrl}/content`, query.from, query.to, query.serverName, options)
    }

    getStatus(options?: RequestOptions): Promise<ServerStatus> {
        return this.fetchJson('/content/status', options)
    }

    async downloadContent(fileHash: ContentFileHash, options?: RequestOptions): Promise<ContentFile> {
        const { attempts = 3, waitTime = '0.5s' } = options

        return retry(async () => {
            const content = await this.fetcher.fetchBuffer(`${this.catalystUrl}/content/contents/${fileHash}`, { timeout: options.timeout });
            const downloadedHash = await Hashing.calculateBufferHash(content)
            // Sometimes, the downloaded file is not complete, so the hash turns out to be different.
            // So we will check the hash before considering the download successful.
            if (downloadedHash === fileHash) {
                return { name: fileHash, content: content }
            }
            throw new Error(`Failed to fetch file with hash ${fileHash} from ${this.catalystUrl}`)
        }, attempts, waitTime)
    }

    getProfile(ethAddress: EthAddress, options?: RequestOptions): Promise<EntityMetadata> {
        return this.fetchJson(`lambdas/profile/${ethAddress}`, options)
    }

    /** Given an array of file hashes, return a set with those already uploaded on the server */
    private async hashesAlreadyOnServer(hashes: ContentFileHash[]): Promise<Set<ContentFileHash>> {
        // TODO: Consider splitting into chunks, since if there are too many hashes, the url could get too long
        const queryParam = hashes.map(hash => `cid=${hash}`).join('&')
        const url = `${this.catalystUrl}/content/available-content?${queryParam}`

        const result: { cid: ContentFileHash, available: boolean }[] = await this.fetchJson(url)

        const alreadyUploaded = result.filter(({ available }) => available)
            .map(({ cid }) => cid)

        return new Set(alreadyUploaded)
    }

    private fetchJson(path: string, options?: RequestOptions): Promise<any> {
        return this.fetcher.fetchJson(`${this.catalystUrl}${path}`, options)
    }

    private static sanitizeUrl(url: string): string {
        // Remove empty spaces
        url = url.trim()

        // Make sure protocol isn't HTTP
        if (url.startsWith('http://')) {
            throw new Error(`Can't use HTTP as protocol. Must be HTTPS`)
        }

        // Add protocol if necessary
        if (!url.startsWith('https://')) {
            url = 'https://' + url
        }

        // Remove trailing slash if present
        if (url.endsWith('/')) {
            url = url.slice(0, -1)
        }

        return url
    }

}