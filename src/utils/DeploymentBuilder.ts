import { AuthChain } from 'tcl-crypto'
import {
  Hashing,
  Timestamp,
  buildEntityAndFile,
  EntityType,
  Pointer,
  ContentFile,
  EntityContentItemReference,
  EntityMetadata,
  ContentFileHash,
  EntityId,
  Fetcher
} from 'tcl-catalyst-commons'

export class DeploymentBuilder {
  /**
   * As part of the deployment process, an entity has to be built. In this method, we are building it, based on the data provided.
   * After the entity is built, the user will have to sign the entity id, to prove they are actually who they say they are.
   */
  static async buildEntity(
    type: EntityType,
    pointers: Pointer[],
    files: Map<string, Buffer> = new Map(),
    metadata?: EntityMetadata,
    timestamp?: Timestamp
  ): Promise<DeploymentPreparationData> {
    // Reorder input
    const contentFiles: ContentFile[] = Array.from(files.entries()).map(([name, content]) => ({ name, content }))

    // Calculate hashes
    const hashes = await Hashing.calculateHashes(contentFiles)
    const hashesByKey: Map<string, ContentFileHash> = new Map(hashes.map(({ hash, file }) => [file.name, hash]))
    const filesByHash: Map<ContentFileHash, ContentFile> = new Map(hashes.map(({ hash, file }) => [hash, file]))

    return DeploymentBuilder.buildEntityInternal(type, pointers, { hashesByKey, filesByHash, metadata, timestamp })
  }

  /**
   * In cases where we don't need upload content files, we can simply generate the new entity. We can still use already uploaded hashes on this new entity.
   */
  static async buildEntityWithoutNewFiles(
    type: EntityType,
    pointers: Pointer[],
    hashesByKey?: Map<string, ContentFileHash>,
    metadata?: EntityMetadata,
    timestamp?: Timestamp
  ): Promise<DeploymentPreparationData> {
    return DeploymentBuilder.buildEntityInternal(type, pointers, { hashesByKey, metadata, timestamp })
  }

  private static async buildEntityInternal(
    type: EntityType,
    pointers: Pointer[],
    options?: BuildEntityInternalOptions
  ): Promise<DeploymentPreparationData> {
    // Make sure that there is at least one pointer
    if (pointers.length === 0) {
      throw new Error(`All entities must have at least one pointer.`)
    }

    // Re-organize the hashes
    const hashesByKey: Map<string, ContentFileHash> = options?.hashesByKey ?? new Map()
    const entityContent: EntityContentItemReference[] = Array.from(hashesByKey.entries()).map(([key, hash]) => ({
      file: key,
      hash
    }))

    // Calculate timestamp if necessary
    const timestamp: Timestamp = options?.timestamp ?? (await DeploymentBuilder.calculateTimestamp())

    // Build entity file
    const { entity, entityFile } = await buildEntityAndFile(type, pointers, timestamp, entityContent, options?.metadata)

    // Add entity file to content files
    const filesByHash: Map<ContentFileHash, ContentFile> = options?.filesByHash ?? new Map()
    filesByHash.set(entity.id, entityFile)

    return { files: filesByHash, entityId: entity.id }
  }

  private static async calculateTimestamp(): Promise<Timestamp> {
    // We will try to use a global time API, so if the local PC clock is off, it will still work
    const fetcher = new Fetcher()
    try {
      const { datetime } = await fetcher.fetchJson('https://worldtimeapi.org/api/timezone/Etc/UTC')
      return new Date(datetime).getTime()
    } catch (e) {
      return Date.now()
    }
  }
}

type BuildEntityInternalOptions = {
  hashesByKey?: Map<string, ContentFileHash>
  filesByHash?: Map<ContentFileHash, ContentFile>
  metadata?: EntityMetadata
  timestamp?: Timestamp
}

/** This data contains everything necessary for the user to sign, so that then a deployment can be executed */
export type DeploymentPreparationData = {
  entityId: EntityId
  files: Map<ContentFileHash, ContentFile>
}

export type DeploymentData = DeploymentPreparationData & {
  authChain: AuthChain
}
