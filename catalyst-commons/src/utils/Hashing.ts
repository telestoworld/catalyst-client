import CID from 'cids'
import multihashing from 'multihashing-async';
import { ContentFileHash, ContentFile } from '../types';

export class Hashing {

    /** Given a set of files, return a map with their hash */
    static async calculateHashes(files: ContentFile[]): Promise<Map<ContentFileHash, ContentFile>> {
        const entries = Array.from(files)
            .map<Promise<[ContentFileHash, ContentFile]>>(async file => [await this.calculateHash(file), file])
        return new Map(await Promise.all(entries));
    }

    /** Return the given file's hash */
    static async calculateHash(file: ContentFile): Promise<ContentFileHash> {
        return this.calculateBufferHash(file.content)
    }

    /** Return the given buffer's hash */
    static async calculateBufferHash(buffer: Buffer): Promise<ContentFileHash> {
        const hash = await multihashing(buffer, "sha2-256")
        return new CID(0, 'dag-pb', hash).toBaseEncodedString()
    }
}
