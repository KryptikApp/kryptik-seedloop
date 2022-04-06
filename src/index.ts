// the seed loop holds the seed and keyrings that share the common seed. Each keyring is responsible for a different coin.
import * as bip from "bip39"
import { defaultPath, HDNode } from "@ethersproject/hdnode"
import { TypedDataDomain, TypedDataField } from "@ethersproject/abstract-signer"
import * as bitcoin from 'bitcoinjs-lib'

import { Network, defaultNetworks } from "./network"
import { NetworkFamily } from "./models"
import {TransactionParameters } from "./walletKryptik"
import { validateAndFormatMnemonic, } from "./utils"
import { HDKeyring, SerializedHDKeyring, Options, defaultOptions } from "./keyring"

export {
    normalizeHexAddress,
    normalizeMnemonic,
    toChecksumAddress,
    validateAndFormatMnemonic,
  } from "./utils"

export{
    Network,
    NetworkFromTicker
}
from "./network"

export {NetworkFamily} from "./models"

export { HDKeyring, SerializedHDKeyring, Options, defaultOptions } from "./keyring"

export {WalletKryptik, TransactionParameters } from "./walletKryptik"


export type SerializedSeedLoop = {
    version: number
    // TODO: 2x check to ensure null possibility is safe
    mnemonic: string|null
    // note: each key ring is SERIALIZED
    keyrings: SerializedHDKeyring[]
}


export interface SeedLoop<T> {
    serialize(): Promise<T>
    getKeyRing(coin: Network): Promise<HDKeyring>
    getKeyRingSync(coin: Network): HDKeyring
    getAllKeyrings():HDKeyring[];
    getAddresses(network: Network): Promise<string[]>
    addAddresses(network: Network, n?: number): Promise<string[]>
    addAddressesSync(network: Network, n?: number): string[]
    signTransaction(
        address: string,
        transaction: TransactionParameters,
        network: Network
    ): Promise<string|bitcoin.Psbt|Uint8Array>
    signTypedData(
        address: string,
        domain: TypedDataDomain,
        types: Record<string, Array<TypedDataField>>,
        value: Record<string, unknown>,
        network: Network
    ): Promise<string>
    signMessage(address: string, message: string, network: Network): Promise<string>
}

export interface KeyringClass<T> {
    new(): SeedLoop<T>
    deserialize(serializedKeyring: T): Promise<SeedLoop<T>>
}


export default class HDSeedLoop implements SeedLoop<SerializedSeedLoop>{
    readonly id: string
    #keyrings: HDKeyring[] = []
    #networkToKeyring : {[name:string]: HDKeyring} = {}
    
    #mnemonic: string | null
    #hdNode: HDNode

    constructor(options: Options = {}) {
        const hdOptions: Required<Options> = {
            ...defaultOptions,
            ...options,
        }

        this.#mnemonic = validateAndFormatMnemonic(
            hdOptions.mnemonic || bip.generateMnemonic(hdOptions.strength)
        )
        
        // if error occured when creating mnemonic
        if (!this.#mnemonic) {
            throw new Error("Invalid mnemonic.")
        }

        // set passphrase
        const passphrase = hdOptions.passphrase ?? "";

        // set hdnode
        this.#hdNode = HDNode.fromMnemonic(this.#mnemonic, passphrase, "en");
        this.id = this.#hdNode.fingerprint;

        // only populate with new keyrings if keyrings haven't already been created and serialized
        if (hdOptions.isCreation) {
            this.#populateLoopKeyrings(hdOptions);
        }
        
    }

    // populate seed loop with keyrings for supported Networks
    #populateLoopKeyrings(options:Options) {
        for (let ticker in defaultNetworks) {
            let Network: Network = defaultNetworks[ticker];
            let networkPath:string = Network.path;
            // if EVM family use same path, so address is consistent across chains
            if(Network.getNetworkfamily() == NetworkFamily.EVM){
                // default patrh is bip44 standard for Ethereum
                networkPath = defaultPath;
            }
            let ringOptions:Options = {
                // default path is BIP-44 ethereum coin type, where depth 5 is the address index
                path: networkPath,
                passphrase: options.passphrase,
                strength: 128,
                mnemonic: this.#mnemonic,
                networkTicker: Network.ticker
            }
            // create new key ring for Network given setup options
            var keyRing: HDKeyring = new HDKeyring(ringOptions);
             // add init addresses sync.
            keyRing.addAddressesSync();
            // add key ring to seed loop 
            this.addKeyRing(keyRing);
        }
    }

    // SERIALIZE CODE
    serializeSync(): SerializedSeedLoop{
        let serializedKeyRings: SerializedHDKeyring[] = []
        // serialize the key ring for every coin that's on the seed loop and add to serialized list output
        for (let ticker in this.#networkToKeyring)
        {
            var keyring: HDKeyring = this.#networkToKeyring[ticker]
            var serializedKeyRing: SerializedHDKeyring = keyring.serializeSync()
            serializedKeyRings.push(serializedKeyRing)
        }
        return {
            version: 1,
            mnemonic: this.#mnemonic,
            keyrings: serializedKeyRings
        }
    }
    
    // async version of serialize
    async serialize(): Promise<SerializedSeedLoop> {
        return this.serializeSync()
    }

    // add keyring to dictionary and list of fellow key rings
    addKeyRing(keyring: HDKeyring) {
        this.#keyrings.push(keyring)
        this.#networkToKeyring[keyring.network.ticker] = keyring
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
        // create seed loop that will eventually be returned.
        var seedLoopNew: HDSeedLoop = new HDSeedLoop(loopOptions)
        // deserialize keyrings
        keyrings.forEach(function (serializedKeyRing) {
            var keyRing: HDKeyring = HDKeyring.deserialize(serializedKeyRing);
            seedLoopNew.addKeyRing(keyRing);
        })     

        return seedLoopNew;
    }

    async getKeyRing(Network: Network): Promise<HDKeyring> {
        return this.#networkToKeyring[Network.ticker];
    }
    getKeyRingSync(Network: Network): HDKeyring {
        return this.#networkToKeyring[Network.ticker];
    }

    async signTransaction(
        address: string,
        transaction: TransactionParameters,
        network = defaultNetworks.eth
      ): Promise<string|bitcoin.Psbt|Uint8Array> {
        let keyring = await this.getKeyRing(network);
        let signedTransaction = await keyring.signTransaction(address, transaction)
        return signedTransaction;
    }

    async signTypedData(
        address: string,
        domain: TypedDataDomain,
        types: Record<string, Array<TypedDataField>>,
        value: Record<string, unknown>,
        network = defaultNetworks.eth
      ): Promise<string> {
        let keyring = await this.getKeyRing(network);
        if(network.networkFamily!=NetworkFamily.EVM) throw Error("Signing typed data not supported for non EVM chains yet.");
        let signedTypedData:string = await keyring.signTypedData(address, domain, types, value);
        return signedTypedData;
    }

    async signMessage(address: string, message: string, network=defaultNetworks.eth): Promise<string> {
        let keyring = await this.getKeyRing(network);
        let signedMessage:string = await keyring.signMessage(address, message);
        return signedMessage;
    }

    async getAddresses(network:Network): Promise<string[]>{
        let keyring = await this.getKeyRing(network);
        let addresses:string[] = await keyring.getAddresses();
        return addresses;
    }
    // add addresses to a given network
    async addAddresses(network:Network, n:number=1): Promise<string[]>{
        let keyring = await this.getKeyRing(network);
        let addresses:string[] = await keyring.addAddresses(n);
        return addresses;
    }
    // add addresses to a given network synchronously
    addAddressesSync(network:Network, n:number=1): string[]{
        let keyring = this.getKeyRingSync(network);
        let addresses:string[] = keyring.addAddressesSync(n);
        return addresses;
    }
    // gets all keyrings hanging on seedloop
    getAllKeyrings():HDKeyring[] {
        return this.#keyrings;
    }
}