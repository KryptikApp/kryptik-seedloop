// the seed loop holds the seed and keyrings that share the common seed. Each keyring is responsible for a different coin.
import * as bip from "bip39"
import { Network, defaultNetworks } from "./network.js"
import HDKeyring from "./keyring.js"
import HDKeyRing, { SerializedHDKeyring } from "./keyring.js"
import { validateAndFormatMnemonic, Options, defaultOptions } from "./utils.js"
export {
    normalizeHexAddress,
    normalizeMnemonic
} from "./utils.js"

export type SerializedSeedLoop = {
    version: number
    // TODO: 2x check to ensure null possibility is safe
    mnemonic: string|null
    // note: each key ring is SERIALIZED
    keyrings: SerializedHDKeyring[]
}


export interface SeedLoop<T> {
    serialize(): Promise<T>
    getKeyRing(coin: Network): Promise<HDKeyRing>
}

export interface KeyringClass<T> {
    new(): SeedLoop<T>
    deserialize(serializedKeyring: T): Promise<SeedLoop<T>>
}


export default class HDSeedLoop implements SeedLoop<SerializedSeedLoop>{
    // TODO.. make private in production. Public for testing right now.
    mnemonic: string | null
    keyrings: HDKeyring[] = []
    networkToKeyring : {[name:string]: HDKeyRing} = {}

    constructor(options: Options = {}) {
        const hdOptions: Required<Options> = {
            ...defaultOptions,
            ...options,
        }

        this.mnemonic = validateAndFormatMnemonic(
            hdOptions.mnemonic || bip.generateMnemonic(hdOptions.strength)
        )
        
        // error occured when creating mnemonic
        if (!this.mnemonic) {
            throw new Error("Invalid mnemonic.")
        }

        // only populate with new keyrings if keyrings haven't already been created and serialized
        if (hdOptions.isCreation) {
            this.#populateLoopKeyrings();
        }
        
    }

    // populate seed loop with keyrings for supported Networks
    #populateLoopKeyrings() {
        for (let ticker in defaultNetworks) {
            let Network: Network = defaultNetworks[ticker]
            let ringOptions = {
                // default path is BIP-44 ethereum coin type, where depth 5 is the address index
                path: Network.path,
                strength: 128,
                mnemonic: this.mnemonic,
                NetworkTicker: Network.ticker
            }
            // create new key ring for Network given setup options
            var keyRing: HDKeyring = new HDKeyring(ringOptions);
            // add key ring to seed loop 
            this.addKeyRing(keyRing);
        }
    }

    // SERIALIZE CODE
    serializeSync(): SerializedSeedLoop{
        let serializedKeyRings: SerializedHDKeyring[] = []
        // serialize the key ring for every coin that's on the seed loop and add to serialized list output
        for (let ticker in this.networkToKeyring)
        {
            var keyring: HDKeyring = this.networkToKeyring[ticker]
            var serializedKeyRing: SerializedHDKeyring = keyring.serializeSync()
            serializedKeyRings.push(serializedKeyRing)
        }
        return {
            version: 1,
            mnemonic: this.mnemonic,
            keyrings: serializedKeyRings
        }
    }
    
    // async version of serialize
    async serialize(): Promise<SerializedSeedLoop> {
        return this.serializeSync()
    }

    // add keyring to dictionary and list of fellow key rings
    async addKeyRing(keyring: HDKeyring) {
        this.keyrings.push(keyring)
        this.networkToKeyring[keyring.network.ticker] = keyring
    }

    // DESERIALIZE CODE
    static deserialize(obj: SerializedSeedLoop): HDSeedLoop {
        const { version, mnemonic, keyrings } = obj
        if (version !== 1) {
            throw new Error(`Unknown serialization version ${obj.version}`)
        }

        // create loop options with prexisting mnemonic
        // TODO add null check for mnemonic
        let loopOptions = {
            // default path is BIP-44 ethereum coin type, where depth 5 is the address index
            strength: 128,
            mnemonic: mnemonic,
            isCreation: false
        }
        // create seed loop that will eventually be returned
        var seedLoopNew: HDSeedLoop = new HDSeedLoop(loopOptions)
        // deserialize keyrings
        keyrings.forEach(function (serializedKeyRing) {
            var keyRing: HDKeyring = HDKeyring.deserialize(serializedKeyRing);
            seedLoopNew.addKeyRing(keyRing);
        })     

        return seedLoopNew;
    }


    async getKeyRing(Network: Network): Promise<HDKeyRing> {
        return this.networkToKeyring[Network.ticker];
    }
}