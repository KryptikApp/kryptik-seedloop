import { BlockTag, FeeData, Provider, TransactionRequest, TransactionResponse } from "@ethersproject/abstract-provider";
import { BigNumber, BigNumberish } from "@ethersproject/bignumber";
import { Bytes, BytesLike } from "@ethersproject/bytes";
import { Deferrable, resolveProperties, shallowCopy } from "@ethersproject/properties";

import { Logger } from "@ethersproject/logger";

const allowedTransactionKeys: Array<string> = [
    "accessList", "ccipReadEnabled", "chainId", "customData", "data", "from", "gasLimit", "gasPrice", "maxFeePerGas", "maxPriorityFeePerGas", "nonce", "to", "type", "value"
];

const forwardErrors = [
    Logger.errors.INSUFFICIENT_FUNDS,
    Logger.errors.NONCE_EXPIRED,
    Logger.errors.REPLACEMENT_UNDERPRICED,
];

// EIP-712 Typed Data
// See: https://eips.ethereum.org/EIPS/eip-712

export interface TypedDataDomain {
    name?: string;
    version?: string;
    chainId?: BigNumberish;
    verifyingContract?: string;
    salt?: BytesLike;
};

export interface TypedDataField {
    name: string;
    type: string;
};

// Sub-classes of Signer may optionally extend this interface to indicate
// they have a private key available synchronously
export interface ExternallyOwnedAccount {
    readonly address: string;
    readonly privateKey: string;
}

// Sub-Class Notes:
//  - A Signer MUST always make sure, that if present, the "from" field
//    matches the Signer, before sending or signing a transaction
//  - A Signer SHOULD always wrap private information (such as a private
//    key or mnemonic) in a function, so that console.log does not leak
//    the data

// @TODO: This is a temporary measure to preserve backwards compatibility
//        In v6, the method on TypedDataSigner will be added to Signer
export interface TypedDataSigner {
    _signTypedData(domain: TypedDataDomain, types: Record<string, Array<TypedDataField>>, value: Record<string, any>): Promise<string>;
}

export abstract class SignerEthers {
    readonly provider?: Provider;

    ///////////////////
    // Sub-classes MUST implement these

    // Returns the checksum address
    abstract getAddress(): Promise<string>

    // Returns the signed prefixed-message. This MUST treat:
    // - Bytes as a binary message
    // - string as a UTF8-message
    // i.e. "0x1234" is a SIX (6) byte string, NOT 2 bytes of data
    abstract signMessage(message: Bytes | string): Promise<string>;

    // Signs a transaction and returns the fully serialized, signed transaction.
    // The EXACT transaction MUST be signed, and NO additional properties to be added.
    // - This MAY throw if signing transactions is not supports, but if
    //   it does, sentTransaction MUST be overridden.
    abstract signTransaction(transaction: Deferrable<TransactionRequest>): Promise<string>;

    // Returns a new instance of the Signer, connected to provider.
    // This MAY throw if changing providers is not supported.
    abstract connect(provider: Provider): SignerEthers;

    readonly _isSigner: boolean;


    ///////////////////
    // Sub-classes MUST call super
    constructor() {
        //logger.checkAbstract(new.target, Signer);
        this._isSigner = true;
    }


    ///////////////////
    // Sub-classes MAY override these

    async getBalance(blockTag?: BlockTag): Promise<BigNumber> {
        if (!this.provider) {
            throw Error("Provider not defined!")
        }
        return await this.provider.getBalance(this.getAddress(), blockTag);
    }

    async getTransactionCount(blockTag?: BlockTag): Promise<number> {
        if (!this.provider) {
            throw Error("Provider not defined!")
        }
        return await this.provider.getTransactionCount(this.getAddress(), blockTag);
    }

    // Populates "from" if unspecified, and estimates the gas for the transaction
    async estimateGas(transaction: Deferrable<TransactionRequest>): Promise<BigNumber> {
        if (!this.provider) {
            throw Error("Provider not defined!")
        }
        const tx = await resolveProperties(this.checkTransaction(transaction));
        return await this.provider.estimateGas(tx);
    }

    // Populates "from" if unspecified, and calls with the transaction
    async call(transaction: Deferrable<TransactionRequest>, blockTag?: BlockTag): Promise<string> {
        if (!this.provider) {
            throw Error("Provider not defined!")
        }
        const tx = await resolveProperties(this.checkTransaction(transaction));
        return await this.provider.call(tx, blockTag);
    }

    // Populates all fields in a transaction, signs it and sends it to the network
    async sendTransaction(transaction: Deferrable<TransactionRequest>): Promise<TransactionResponse> {
        if (!this.provider) {
            throw Error("Provider not defined!")
        }
        const tx = await this.populateTransaction(transaction);
        const signedTx = await this.signTransaction(tx);
        return await this.provider.sendTransaction(signedTx);
    }

    async getChainId(): Promise<number> {
        if (!this.provider) {
            throw Error("Provider not defined!")
        }
        const network = await this.provider.getNetwork();
        return network.chainId;
    }

    async getGasPrice(): Promise<BigNumber> {
        if (!this.provider) {
            throw Error("Provider not defined!")
        }
        return await this.provider.getGasPrice();
    }

    async getFeeData(): Promise<FeeData> {
        if (!this.provider) {
            throw Error("Provider not defined!")
        }
        return await this.provider.getFeeData();
    }


    async resolveName(name: string): Promise<string> {
        if (!this.provider) {
            throw Error("Provider not defined!")
        }
        return this.getNameHelper(name);
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


    // Checks a transaction does not contain invalid keys and if
    // no "from" is provided, populates it.
    // - does NOT require a provider
    // - adds "from" is not present
    // - returns a COPY (safe to mutate the result)
    // By default called from: (overriding these prevents it)
    //   - call
    //   - estimateGas
    //   - populateTransaction (and therefor sendTransaction)
    checkTransaction(transaction: Deferrable<TransactionRequest>): Deferrable<TransactionRequest> {
        for (const key in transaction) {
            if (allowedTransactionKeys.indexOf(key) === -1) {
                throw Error("invalid transaction key: " + key)
            }
        }

        const tx = shallowCopy(transaction);

        if (tx.from == null) {
            tx.from = this.getAddress();

        } else {
            // Make sure any provided address matches this signer
            tx.from = Promise.all([
                Promise.resolve(tx.from),
                this.getAddress()
            ]).then((result) => {
                if(!result[0]) throw Error("Resiult undefined!");
                if (result[0].toLowerCase() !== result[1].toLowerCase()) {
                    throw Error("from address mismatch for transaction: "+ transaction);
                }
                return result[0];
            });
        }

        return tx;
    }

    // Populates ALL keys for a transaction and checks that "from" matches
    // this Signer. Should be used by sendTransaction but NOT by signTransaction.
    // By default called from: (overriding these prevents it)
    //   - sendTransaction
    //
    // Notes:
    //  - We allow gasPrice for EIP-1559 as long as it matches maxFeePerGas
    async populateTransaction(transaction: Deferrable<TransactionRequest>): Promise<TransactionRequest> {

        const tx:any = await resolveProperties(this.checkTransaction(transaction))

        if (tx.to != null) {
            tx.to = Promise.resolve(tx.to).then(async (to) => {
                if (to == null) { return null; }
                const address = await this.resolveName(to);
                if (address == null || address == "not set") {
                    throw Error("provided ENS name resolves to null");
                }
                return address;
            });

            // Prevent this error from causing an UnhandledPromiseException
            tx.to.catch(() => { throw Error("Unhandled error  on transaction") });
        }

        // Do not allow mixing pre-eip-1559 and eip-1559 properties
        const hasEip1559 = (tx.maxFeePerGas != null || tx.maxPriorityFeePerGas != null);
        if (tx.gasPrice != null && (tx.type === 2 || hasEip1559)) {
            throw Error("eip-1559 transaction do not support gasPrice");
        } else if ((tx.type === 0 || tx.type === 1) && hasEip1559) {
            throw Error("pre-eip-1559 transaction do not support maxFeePerGas/maxPriorityFeePerGas");
        }

        if ((tx.type === 2 || tx.type == null) && (tx.maxFeePerGas != null && tx.maxPriorityFeePerGas != null)) {
            // Fully-formed EIP-1559 transaction (skip getFeeData)
            tx.type = 2;

        } else if (tx.type === 0 || tx.type === 1) {
            // Explicit Legacy or EIP-2930 transaction

            // Populate missing gasPrice
            if (tx.gasPrice == null) { tx.gasPrice = this.getGasPrice(); }

        } else {

            // We need to get fee data to determine things
            const feeData = await this.getFeeData();

            if (tx.type == null) {
                // We need to auto-detect the intended type of this transaction...

                if (feeData.maxFeePerGas != null && feeData.maxPriorityFeePerGas != null) {
                    // The network supports EIP-1559!

                    // Upgrade transaction from null to eip-1559
                    tx.type = 2;

                    if (tx.gasPrice != null) {
                        // Using legacy gasPrice property on an eip-1559 network,
                        // so use gasPrice as both fee properties
                        const gasPrice = tx.gasPrice;
                        delete tx.gasPrice;
                        tx.maxFeePerGas = gasPrice;
                        tx.maxPriorityFeePerGas = gasPrice;

                    } else {
                        // Populate missing fee data
                        if (tx.maxFeePerGas == null) { tx.maxFeePerGas = feeData.maxFeePerGas; }
                        if (tx.maxPriorityFeePerGas == null) { tx.maxPriorityFeePerGas = feeData.maxPriorityFeePerGas; }
                    }

                } else if (feeData.gasPrice != null) {
                    // Network doesn't support EIP-1559...

                    // ...but they are trying to use EIP-1559 properties
                    if (hasEip1559) {
                        throw Error("network does not support EIP-1559");
                    }

                    // Populate missing fee data
                    if (tx.gasPrice == null) { tx.gasPrice = feeData.gasPrice; }

                    // Explicitly set untyped transaction to legacy
                    tx.type = 0;

                } else {
                    // getFeeData has failed us.
                    throw Error("failed to get consistent fee data");
                }

            } else if (tx.type === 2) {
                // Explicitly using EIP-1559

                // Populate missing fee data
                if (tx.maxFeePerGas == null) { tx.maxFeePerGas = feeData.maxFeePerGas; }
                if (tx.maxPriorityFeePerGas == null) { tx.maxPriorityFeePerGas = feeData.maxPriorityFeePerGas; }
            }
        }

        if (tx.nonce == null) { tx.nonce = this.getTransactionCount("pending"); }

        if (tx.gasLimit == null) {
            tx.gasLimit = this.estimateGas(tx).catch((error) => {
                if (forwardErrors.indexOf(error.code) >= 0) {
                    throw error;
                }

                throw Error("cannot estimate gas; transaction may fail or may require manual gas limit");
            });
        }

        if (tx.chainId == null) {
            tx.chainId = this.getChainId();
        } else {
            tx.chainId = Promise.all([
                Promise.resolve(tx.chainId),
                this.getChainId()
            ]).then((results) => {
                if (results[1] !== 0 && results[0] !== results[1]) {
                    throw Error("chainId address mismatch");
                }
                return results[0];
            });
        }

        return await resolveProperties(tx);
    }


    ///////////////////
    // Sub-classes SHOULD leave these alone

    _checkProvider(): void {
        if (!this.provider) {
            throw Error("Provider not defined!")
        }
    }

    static isSigner(value: any): value is SignerEthers {
        return !!(value && value._isSigner);
    }
}
