import { TypedDataDomain, TypedDataField } from "@ethersproject/abstract-signer"
import { HDNode } from "@ethersproject/hdnode"
import * as bitcoin from 'bitcoinjs-lib'
import { generateMnemonic } from "bip39"

import { Network, NetworkFromTicker, NetworkFamily } from "./network"
import { normalizeHexAddress, validateAndFormatMnemonic } from "./utils"
import {WalletKryptik, TransactionParameters } from "./walletKryptik"


export type Options = {
    strength?: number
    path?: string
    mnemonic?: string | null
    networkTicker?: string
    isCreation?: boolean
    passphrase?: string|null
    parentNode?: HDNode|null
}

export const defaultOptions = {
  // default path is BIP-44, where depth 5 is the address index
  path: "m/44'/60'/0'/0",
  strength: 128,
  mnemonic: null,
  networkTicker: "Eth",
  passphrase: null,
  isCreation: true,
  parentNode:null
}




export type SerializedHDKeyring = {
  version: number
  id: string
  mnemonic: string
  path: string
  keyringType: string
  addressIndex: number
  networkTicker: string
}

export interface Keyring<T> {
  serialize(): Promise<T>
  getAddresses(): Promise<string[]>
  addAddresses(n?: number): Promise<string[]>
  signTransaction(
    address: string,
    transaction: TransactionParameters
  ): Promise<string|bitcoin.Psbt|Uint8Array>
  signTypedData(
    address: string,
    domain: TypedDataDomain,
    types: Record<string, Array<TypedDataField>>,
    value: Record<string, unknown>
  ): Promise<string>
  signMessage(address: string, message: string): Promise<string>
}

export interface KeyringClass<T> {
  new (): Keyring<T>
  deserialize(serializedKeyring: T): Promise<Keyring<T>>
}

export class HDKeyring implements Keyring<SerializedHDKeyring> {
  static readonly type: string = "bip32"

  readonly path: string

  readonly id: string
  readonly network:Network

  #hdNode: HDNode

  #addressIndex: number

  #wallets: WalletKryptik[]

  #addressToWallet: { [address: string]: WalletKryptik}

  #mnemonic: string

  constructor(options: Options = {}) {
    const hdOptions: Required<Options> = {
      ...defaultOptions,
      ...options,
    }

    const mnemonic = validateAndFormatMnemonic(
      hdOptions.mnemonic || generateMnemonic(hdOptions.strength)
    )

    if (!mnemonic) {
      throw new Error("Invalid mnemonic.")
    }

    this.#mnemonic = mnemonic

    const passphrase = hdOptions.passphrase ?? ""

    this.path = hdOptions.path

    let parentNode:HDNode;
    if(hdOptions.parentNode){
      parentNode = hdOptions.parentNode;
    }
    else{
      parentNode = HDNode.fromMnemonic(mnemonic, passphrase, "en");
    }
    

    this.#hdNode = parentNode.derivePath(
      this.path
    )
    this.id = this.#hdNode.fingerprint
    this.#addressIndex = 0
    this.#wallets = []
    this.#addressToWallet = {}
    this.network = NetworkFromTicker(hdOptions.networkTicker)
  }

  serializeSync(): SerializedHDKeyring {
    return {
      version: 1,
      id: this.id,
      mnemonic: this.#mnemonic,
      keyringType: HDKeyring.type,
      path: this.path,
      addressIndex: this.#addressIndex,
      networkTicker: this.network.ticker
    }
  }

  async serialize(): Promise<SerializedHDKeyring> {
    return this.serializeSync()
  }

  static deserialize(obj: SerializedHDKeyring, passphrase?: string): HDKeyring {
    const { version, keyringType, mnemonic, path, addressIndex, networkTicker } = obj
    if (version !== 1) {
      throw new Error(`Unknown serialization version ${obj.version}`)
    }

    if (keyringType !== HDKeyring.type) {
      throw new Error("HDKeyring only supports BIP-32/44 style HD wallets.")
    }

    const keyring = new HDKeyring({
      mnemonic,
      path,
      passphrase,
      networkTicker
    })

    keyring.addAddressesSync(addressIndex)

    return keyring
  }


  // TODO: update for utxo based blockchains which may need to lump tx.s to different addresses into one tx.
  async signTransaction(
    address: string,
    transaction:TransactionParameters
  ): Promise<string|bitcoin.Psbt|Uint8Array> {
    
    // normalize EVM address
    let normAddress:string = NetworkFamily.EVM?normalizeHexAddress(address):address;
    if (!this.#addressToWallet[normAddress]) {
      throw new Error("Address not found!")
    }
    
    // catch invalid transaction params and the sign
    switch(this.network.networkFamily){
      case NetworkFamily.EVM:{
        if(!transaction.evmTransaction) throw Error("No EVM transaction passed to sign.");
        return this.#addressToWallet[normAddress].signKryptikTransaction(transaction)
      }
      case NetworkFamily.Bitcoin:{
        if(!transaction.btcTransaction) throw Error("No BTC transaction passed to sign.");
        return this.#addressToWallet[normAddress].signKryptikTransaction(transaction)
      }
      case NetworkFamily.Solana:{
        if(!transaction.solTransactionBuffer) throw Error("No Solana transaction passed to sign.");
        return this.#addressToWallet[normAddress].signKryptikTransaction(transaction)
      }
      default:{
        throw Error(`Network with chain id: ${this.network.chainId} not yet supported for transaction signatures.`)
      }
    }
    
  }

  async signTypedData(
    address: string,
    domain: TypedDataDomain,
    types: Record<string, Array<TypedDataField>>,
    value: Record<string, unknown>
  ): Promise<string> {
    let normAddress:string = NetworkFamily.EVM?normalizeHexAddress(address):address;
    if (!this.#addressToWallet[normAddress]) {
      throw new Error("Address not found!")
    }
    // eslint-disable-next-line no-underscore-dangle
    return this.#addressToWallet[normAddress]._signTypedData(
      domain,
      types,
      value
    )
  }

  async signMessage(address: string, message: string): Promise<string> {
    let normAddress:string = NetworkFamily.EVM?normalizeHexAddress(address):address;
    if (!this.#addressToWallet[normAddress]) {
      throw new Error("Address not found!")
    }
    return this.#addressToWallet[normAddress].signMessage(message)
  }

  // TODO: update to add addresses with balances when importing seed
  addAddressesSync(numNewAccounts = 1): string[] {
    const numAddresses = this.#addressIndex

    if (numNewAccounts < 0 || numAddresses + numNewAccounts > 2 ** 31 - 1) {
      throw new Error("New account index out of range")
    }

    for (let i = 0; i < numNewAccounts; i += 1) {
      this.#deriveChildWallet(i + numAddresses)
    }

    this.#addressIndex += numNewAccounts
    const addresses = this.getAddressesSync()
    return addresses.slice(-numNewAccounts)
  }

  async addAddresses(numNewAccounts = 1): Promise<string[]> {
    return this.addAddressesSync(numNewAccounts)
  }

  #deriveChildWallet(index: number): void {
    const newPath = `${index}`
    const childNode = this.#hdNode.derivePath(newPath)
    const walletKryptik = new WalletKryptik(childNode.privateKey, this.network)
    this.#wallets.push(walletKryptik)
    let address:string = walletKryptik.generateAddress(walletKryptik.publicKey, walletKryptik.privateKey);
    // normalize for readability if from evm chain family
    if(this.network.getNetworkfamily() == NetworkFamily.EVM){
      address = normalizeHexAddress(walletKryptik.address)
    }
    this.#addressToWallet[address] = walletKryptik
  }

  getAddressesSync(): string[] {
    let networkFamily:NetworkFamily = this.network.getNetworkfamily();
    return this.#wallets.map((w) => networkFamily == NetworkFamily.EVM?normalizeHexAddress(w.addressKryptik):w.addressKryptik)
  }

  async getAddresses(): Promise<string[]> {
    return this.getAddressesSync()
  }

  
}