// the seed loop holds the seed and keyrings that share the common seed. Each keyring is responsible for a different coin.
import * as bip from "bip39"
import { HDNode } from "@ethersproject/hdnode"
import { TypedDataDomain, TypedDataField } from "@ethersproject/abstract-signer"
import * as bitcoin from 'bitcoinjs-lib'

import { Network, defaultNetworks, NetworkFamily } from "./network"
import {TransactionParameters, WalletKryptik } from "./walletKryptik"
import { validateAndFormatMnemonic } from "./utils"
import { HDKeyring, SerializedHDKeyring, Options, defaultOptions } from "./keyring"
import nacl from "tweetnacl"
import { EVM_FAMILY_KEYRING_NAME, NEAR_FAMILY_KEYRING_NAME, SOLANA_FAMILY_KEYRING_NAME } from "./constants"

export {
    normalizeHexAddress,
    normalizeMnemonic,
    toChecksumAddress,
    validateAndFormatMnemonic,
    isValidEVMAddress, truncateAddress, formatAddress
  } from "./utils"

export{
    Network,
    NetworkFamily,
    NetworkParameters,
    NetworkFamilyFromFamilyName,
    NetworkFromTicker
}
from "./network"


export { HDKeyring, SerializedHDKeyring, Options, defaultOptions } from "./keyring"

export {WalletKryptik, TransactionParameters } from "./walletKryptik"


export type SerializedSeedLoop = {
    version: number
    // TODO: 2x check to ensure null possibility is safe
    mnemonic: string|null
    // note: each key ring is SERIALIZED
    keyrings: SerializedHDKeyring[]
}

export interface SignedTransaction{
    evmFamilyTx?: string,
    bitcoinFamilyTx?: bitcoin.Psbt
    solanaFamilyTx?: Uint8Array
    nearFamilyTx?: Uint8Array
}


export interface SeedLoop<T> {
    serialize(): Promise<T>
    getKeyRing(coin: Network): Promise<HDKeyring>
    getKeyRingSync(coin: Network): HDKeyring
    getAllKeyrings():HDKeyring[];
    getWalletForAddress(network:Network, address:string):WalletKryptik|null
    getAddresses(network: Network): Promise<string[]>
    addAddresses(network: Network, n?: number): Promise<string[]>
    addAddressesSync(network: Network, n?: number): string[]
    addKeyRingByNetwork(network:Network):HDKeyring|null
    getSeedPhrase():string|null
    networkOnSeedloop(network:Network):boolean;
    signTransaction(
        address: string,
        transaction: TransactionParameters,
        network: Network
    ): Promise<SignedTransaction>
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
    #networkToKeyring : {[name:string]: HDKeyring} = {}
    
    #mnemonic: string | null
    #hdNode: HDNode

    constructor(options: Options = {}, networks:Network[]=Object.values(defaultNetworks)) {
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
            this.#populateLoopKeyrings(hdOptions, networks);
        }
        
    }

    // populate seed loop with keyrings for supported Networks
    #populateLoopKeyrings(options:Options, networks:Network[]=Object.values(defaultNetworks)) {
        for (const Network of networks) {
            let networkPath:string = Network.path;
            // if the network is already on the seedloop.. move on to the next network
            if(this.networkOnSeedloop(Network)) continue;
            // if EVM family... use same path, so address is consistent across chains
            // default path is bip44 standard for Ethereum
            if(Network.networkFamily == NetworkFamily.EVM){
                networkPath = defaultOptions.path;
            }
            let ringOptions:Options = {
                // default path is BIP-44 ethereum coin type
                path: networkPath,
                passphrase: options.passphrase,
                strength: 128,
                mnemonic: this.#mnemonic,
                network: Network,
                parentNode: this.#hdNode
            }
            // create new key ring for Network given setup options
            var keyRing: HDKeyring = new HDKeyring(ringOptions);
             // add init addresses sync.
            keyRing.addAddressesSync();
            // add key ring to seed loop 
            this.addKeyRing(keyRing);
        }
    }

    addKeyRingByNetwork(network:Network):HDKeyring{
        if(this.networkOnSeedloop(network)) return this.getKeyRingSync(network);
        let networkPath = network.path;
        if(network.networkFamily == NetworkFamily.EVM){
            networkPath = defaultOptions.path;
        }
        let ringOptions:Options = {
            path: networkPath,
            strength: 128,
            mnemonic: this.#mnemonic,
            network: network
        }
        // create new key ring for Network given setup options
        var keyRing: HDKeyring = new HDKeyring(ringOptions);
         // add init addresses sync.
        keyRing.addAddressesSync();
        // add key ring to seed loop 
        this.addKeyRing(keyRing);
        return keyRing;
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
        let network:Network = keyring.network;
        switch(network.networkFamily){
            case(NetworkFamily.Bitcoin):{
                this.#networkToKeyring[network.ticker] = keyring;
                break;
            }
            case(NetworkFamily.EVM):{
                this.#networkToKeyring[EVM_FAMILY_KEYRING_NAME] = keyring;
                keyring
                break;
            }
            case(NetworkFamily.Near):{
                this.#networkToKeyring[NEAR_FAMILY_KEYRING_NAME] = keyring;
                break;
            }
            case(NetworkFamily.Solana):{
                this.#networkToKeyring[SOLANA_FAMILY_KEYRING_NAME] = keyring;
                break;
            }
            default:{
                this.#networkToKeyring[network.ticker] = keyring;
                break;
            }
        }
    }

    // DESERIALIZE CODE
    static deserialize(obj: SerializedSeedLoop): HDSeedLoop {
        const { version, mnemonic, keyrings } = obj
        if (version !== 1) {
            throw new Error(`Unknown serialization version ${obj.version}`)
        }

        // create loop options with pre-existing mnemonic
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

    getSeedPhrase():string|null{
        return this.#mnemonic;
    }

    async getKeyRing(network: Network): Promise<HDKeyring> {
        let keyringToReturn:HDKeyring = this.getKeyRingSync(network);
        return keyringToReturn;
    }
    getKeyRingSync(network: Network): HDKeyring {
        let keyringToReturn:HDKeyring;
        switch(network.networkFamily){
            case(NetworkFamily.Bitcoin):{
                keyringToReturn = this.#networkToKeyring[network.ticker];
                break;
            }
            case(NetworkFamily.EVM):{
                keyringToReturn = this.#networkToKeyring[EVM_FAMILY_KEYRING_NAME];
                break;
            }
            case(NetworkFamily.Near):{
                keyringToReturn = this.#networkToKeyring[NEAR_FAMILY_KEYRING_NAME];
                break;
            }
            case(NetworkFamily.Solana):{
                keyringToReturn = this.#networkToKeyring[SOLANA_FAMILY_KEYRING_NAME];
                break;
            }
            default:{
                keyringToReturn = this.#networkToKeyring[network.ticker];
                break;
            }
        }
        if(!keyringToReturn) throw(new Error(`Error: Unable to retrieve keyring ${network.fullName}. Name not present in network map.`))
        return keyringToReturn;
    }

    async signTransaction(
        address: string,
        transaction: TransactionParameters,
        network = defaultNetworks.eth
      ): Promise<SignedTransaction> {
        let keyring = await this.getKeyRing(network);
        let signedTransaction = await keyring.signTransaction(address, transaction)
        return signedTransaction;
    }

    networkOnSeedloop(network:Network):boolean{
        // account based families can share the same keyring
        // tx based families like bitcoin should have a distinct keyring for every network
        if(!network) throw(new Error("Error: network not provided. Unable to check if network is on seedloop."));
        switch(network.networkFamily){
            case(NetworkFamily.Bitcoin):{
                return network.ticker in this.#networkToKeyring;
            }
            case(NetworkFamily.EVM):{
                return EVM_FAMILY_KEYRING_NAME in this.#networkToKeyring;
            }
            case(NetworkFamily.Near):{
                return NEAR_FAMILY_KEYRING_NAME in this.#networkToKeyring;
            }
            case(NetworkFamily.Solana):{
                return SOLANA_FAMILY_KEYRING_NAME in this.#networkToKeyring;
            }
            default:{
                return false;
            }
        }
    }

    async signTypedData(
        address: string,
        domain: TypedDataDomain,
        types: Record<string, Array<TypedDataField>>,
        value: Record<string, unknown>,
        network = defaultNetworks.eth
      ): Promise<string> {
        let keyring = await this.getKeyRing(network);
        if(!this.#keyringValid) throw Error("Invalid keyring, ensure keyring was defined and added to seedloop.");
        if(network.networkFamily!=NetworkFamily.EVM) throw Error("Signing typed data not supported for non EVM chains yet.");
        let signedTypedData:string = await keyring.signTypedData(address, domain, types, value);
        return signedTypedData;
    }

    async signMessage(address: string, message: string, network=defaultNetworks.eth): Promise<string> {
        let keyring = await this.getKeyRing(network);
        if(!this.#keyringValid) throw Error("Invalid keyring, ensure keyring was defined and added to seedloop.");
        let signedMessage:string = await keyring.signMessage(address, message);
        return signedMessage;
    }

    async getAddresses(network:Network): Promise<string[]>{
        let keyring = await this.getKeyRing(network);
        if(!this.#keyringValid) throw Error("Invalid keyring, ensure keyring was defined and added to seedloop.");
        let addresses:string[] = await keyring.getAddresses();
        return addresses;
    }

    // add addresses to a given network
    async addAddresses(network:Network, n:number=1): Promise<string[]>{
        let keyring = await this.getKeyRing(network);
        if(!this.#keyringValid) throw Error("Invalid keyring, ensure keyring was defined and added to seedloop.");
        let addresses:string[] = await keyring.addAddresses(n);
        return addresses;
    }
    // add addresses to a given network synchronously
    addAddressesSync(network:Network, n:number=1): string[]{
        let keyring = this.getKeyRingSync(network);
        if(!this.#keyringValid(keyring)) throw Error("Invalid keyring, ensure keyring was defined and added to seedloop.");
        let addresses:string[] = keyring.addAddressesSync(n);
        return addresses;
    }
    // gets all keyrings hanging on seedloop
    getAllKeyrings():HDKeyring[] {
        let keyringsToReturn:HDKeyring[] = [];
        for(const ticker in this.#networkToKeyring){
            keyringsToReturn.push(this.#networkToKeyring[ticker]);
        }
        return keyringsToReturn;
    }

    #keyringValid(keyring:HDKeyring):boolean{
        return keyring!=undefined;
    }

    getWalletForAddress(network:Network, address:string):WalletKryptik|null{
        let keyring = this.getKeyRingSync(network);
        if(!this.#keyringValid(keyring)) throw Error("Invalid keyring, ensure keyring was defined and added to seedloop.");
        let walletToReturn:WalletKryptik|null = keyring.getWalletSync(address);
        return walletToReturn;
    }

    getKeypairForAddress(network:Network, address:string):nacl.SignKeyPair|null{
        let keyring = this.getKeyRingSync(network);
        if(!this.#keyringValid(keyring)) throw Error("Invalid keyring, ensure keyring was defined and added to seedloop.");
        let keypairToReturn:nacl.SignKeyPair|null = keyring.getKeypairSync(address);
        return keypairToReturn;
    }
}