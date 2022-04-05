import { getAddress } from "@ethersproject/address";
import { Provider, TransactionRequest } from "@ethersproject/abstract-provider";
import { ExternallyOwnedAccount, TypedDataDomain, TypedDataField, TypedDataSigner } from "@ethersproject/abstract-signer";
import { arrayify, Bytes, BytesLike, concat, hexDataSlice, isHexString, joinSignature, SignatureLike } from "@ethersproject/bytes";
import { hashMessage, _TypedDataEncoder } from "@ethersproject/hash";
import { defaultPath, HDNode, entropyToMnemonic, Mnemonic } from "@ethersproject/hdnode";
import { keccak256 } from "@ethersproject/keccak256";
import { resolveProperties } from "@ethersproject/properties";
import { randomBytes } from "@ethersproject/random";
import { SigningKey } from "@ethersproject/signing-key";
import { decryptJsonWallet, decryptJsonWalletSync, encryptKeystore, ProgressCallback } from "@ethersproject/json-wallets";
import { computeAddress, recoverAddress, serialize, UnsignedTransaction } from "@ethersproject/transactions";
import { Wordlist } from "@ethersproject/wordlists";
import { SignerEthers } from "./signerEthers";



function isAccount(value: any): value is ExternallyOwnedAccount {
    return (value != null && isHexString(value.privateKey, 32) && value.address != null);
}

function hasMnemonic(value: any): value is { mnemonic: Mnemonic } {
    const mnemonic = value.mnemonic;
    return (mnemonic && mnemonic.phrase);
}

export class WalletEthers extends SignerEthers implements ExternallyOwnedAccount, TypedDataSigner {

    readonly address: string;
    readonly provider: Provider|undefined;

    // Wrapping the _signingKey and _mnemonic in a getter function prevents
    // leaking the private key in console.log; still, be careful! :)
    readonly _signingKey: () => SigningKey;
    readonly _mnemonic: () => Mnemonic;

    constructor(privateKey: BytesLike | ExternallyOwnedAccount | SigningKey, provider?: Provider) {
        // REMOVE TO SUPPORT >es6 subclasses
        //logger.checkNew(new.target, WalletEthers);

        super();

        if (isAccount(privateKey)) {
            const signingKey = new SigningKey(privateKey.privateKey);
            // defineReadOnly(this, "_signingKey", () => signingKey);
            // defineReadOnly(this, "address", computeAddress(this.publicKey));
            this._signingKey = () => signingKey;
            this.address = computeAddress(this.publicKey);
            

            if (this.address !== getAddress(privateKey.address)) {
                throw Error("privateKey/address mismatch");
            }

            if (hasMnemonic(privateKey)) {
                const srcMnemonic = privateKey.mnemonic;
                this._mnemonic = () => (
                    {
                        phrase: srcMnemonic.phrase,
                        path: srcMnemonic.path || defaultPath,
                        locale: srcMnemonic.locale || "en"
                    }
                );
                const mnemonic = this.mnemonic;
                const node = HDNode.fromMnemonic(mnemonic.phrase, undefined, mnemonic.locale).derivePath(mnemonic.path);
                if (computeAddress(node.privateKey) !== this.address) {
                    throw Error("mnemonic/address mismatch");
                }
            } else {
                // modified from original null
                this._mnemonic = (): Mnemonic => ({
                    phrase: "not set",
                    path: defaultPath,
                    locale:  "en"
                });
            }


        } else {
            if (SigningKey.isSigningKey(privateKey)) {
                /* istanbul ignore if */
                if (privateKey.curve !== "secp256k1") {
                    throw Error("unsupported curve; must be secp256k1")
                }
                this._signingKey = () => (<SigningKey>privateKey);

            } else {
                // A lot of common tools do not prefix private keys with a 0x (see: #1166)
                if (typeof(privateKey) === "string") {
                    if (privateKey.match(/^[0-9a-f]*$/i) && privateKey.length === 64) {
                        privateKey = "0x" + privateKey;
                    }
                }

                const signingKey = new SigningKey(privateKey);
                this._signingKey = ()=>signingKey;
            }
            this._mnemonic = (): Mnemonic => (
                {
                    phrase: "not set",
                    path: defaultPath,
                    locale: "en"
                }
            );
            this.address = computeAddress(this.publicKey);
        }

        /* istanbul ignore if */
        if (provider && !Provider.isProvider(provider)) {
            throw Error("invalid provider");
        }

        this.provider = provider||undefined;
    }

    get mnemonic(): Mnemonic { return this._mnemonic(); }
    get privateKey(): string { return this._signingKey().privateKey; }
    get publicKey(): string { return this._signingKey().publicKey; }

    getAddress(): Promise<string> {
        return Promise.resolve(this.address);
    }

    connect(provider: Provider): WalletEthers {
        return new WalletEthers(this, provider);
    }

    signTransaction(transaction: TransactionRequest): Promise<string> {
        return resolveProperties(transaction).then((tx) => {
            if (tx.from != null) {
                if (getAddress(tx.from) !== this.address) {
                    throw Error("transaction from address mismatch");
                }
                delete tx.from;
            }

            const signature = this._signingKey().signDigest(keccak256(serialize(<UnsignedTransaction>tx)));
            return serialize(<UnsignedTransaction>tx, signature);
        });
    }

    async signMessage(message: Bytes | string): Promise<string> {
        return joinSignature(this._signingKey().signDigest(hashMessage(message)));
    }

    async _signTypedData(domain: TypedDataDomain, types: Record<string, Array<TypedDataField>>, value: Record<string, any>): Promise<string> {
        // Populate any ENS names
        const populated = await _TypedDataEncoder.resolveNames(domain, types, value, (name: string) => {
            return this.getNameHelper(name);
        });

        return joinSignature(this._signingKey().signDigest(_TypedDataEncoder.hash(populated.domain, types, populated.value)));
    }

    // type helper for resolve ens name function above
    async getNameHelper(name:string):Promise<string>{
        if (this.provider == null) {
            throw Error("cannot resolve ENS names without a provider");
        }
        let ensName:string|null = await this.provider.resolveName(name);
        if(!ensName){
            return "not set";
        }
        return ensName;
    }

    encrypt(password: Bytes | string, options?: any, progressCallback?: ProgressCallback): Promise<string> {
        if (typeof(options) === "function" && !progressCallback) {
            progressCallback = options;
            options = {};
        }

        if (progressCallback && typeof(progressCallback) !== "function") {
            throw new Error("invalid callback");
        }

        if (!options) { options = {}; }

        return encryptKeystore(this, password, options, progressCallback);
    }


    /**
     *  Static methods to create WalletEthers instances.
     */
    static createRandom(options?: any): WalletEthers {
        let entropy: Uint8Array = randomBytes(16);

        if (!options) { options = { }; }

        if (options.extraEntropy) {
            entropy = arrayify(hexDataSlice(keccak256(concat([ entropy, options.extraEntropy ])), 0, 16));
        }

        const mnemonic = entropyToMnemonic(entropy, options.locale);
        return WalletEthers.fromMnemonic(mnemonic, options.path, options.locale);
    }

    static fromEncryptedJson(json: string, password: Bytes | string, progressCallback?: ProgressCallback): Promise<WalletEthers> {
        return decryptJsonWallet(json, password, progressCallback).then((account) => {
            return new WalletEthers(account);
        });
    }

    static fromEncryptedJsonSync(json: string, password: Bytes | string): WalletEthers {
        return new WalletEthers(decryptJsonWalletSync(json, password));
    }

    static fromMnemonic(mnemonic: string, path?: string, wordlist?: Wordlist): WalletEthers {
        if (!path) { path = defaultPath; }
        return new WalletEthers(HDNode.fromMnemonic(mnemonic, undefined, wordlist).derivePath(path));
    }
}

export function verifyMessage(message: Bytes | string, signature: SignatureLike): string {
    return recoverAddress(hashMessage(message), signature);
}

export function verifyTypedData(domain: TypedDataDomain, types: Record<string, Array<TypedDataField>>, value: Record<string, any>, signature: SignatureLike): string {
    return recoverAddress(_TypedDataEncoder.hash(domain, types, value), signature);
}