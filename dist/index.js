"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.defaultOptions = exports.defaultKeyringOptions = exports.HDKeyring = exports.CurveType = exports.NetworkFromTicker = exports.NetworkFamilyFromFamilyName = exports.NetworkFamily = exports.Network = exports.defaultNetworks = exports.formatAddress = exports.truncateAddress = exports.isValidEVMAddress = exports.validateAndFormatMnemonic = exports.normalizeMnemonic = exports.normalizeHexAddress = void 0;
const tslib_1 = require("tslib");
const bip39_1 = require("bip39");
const hdkey_1 = tslib_1.__importDefault(require("hdkey"));
const network_1 = require("./network");
const utils_1 = require("./utils");
const keyring_1 = require("./keyring");
const constants_1 = require("./constants");
const bs58_1 = require("bs58");
const crypto_js_1 = require("crypto-js");
var utils_2 = require("./utils");
Object.defineProperty(exports, "normalizeHexAddress", { enumerable: true, get: function () { return utils_2.normalizeHexAddress; } });
Object.defineProperty(exports, "normalizeMnemonic", { enumerable: true, get: function () { return utils_2.normalizeMnemonic; } });
Object.defineProperty(exports, "validateAndFormatMnemonic", { enumerable: true, get: function () { return utils_2.validateAndFormatMnemonic; } });
Object.defineProperty(exports, "isValidEVMAddress", { enumerable: true, get: function () { return utils_2.isValidEVMAddress; } });
Object.defineProperty(exports, "truncateAddress", { enumerable: true, get: function () { return utils_2.truncateAddress; } });
Object.defineProperty(exports, "formatAddress", { enumerable: true, get: function () { return utils_2.formatAddress; } });
var network_2 = require("./network");
Object.defineProperty(exports, "defaultNetworks", { enumerable: true, get: function () { return network_2.defaultNetworks; } });
Object.defineProperty(exports, "Network", { enumerable: true, get: function () { return network_2.Network; } });
Object.defineProperty(exports, "NetworkFamily", { enumerable: true, get: function () { return network_2.NetworkFamily; } });
Object.defineProperty(exports, "NetworkFamilyFromFamilyName", { enumerable: true, get: function () { return network_2.NetworkFamilyFromFamilyName; } });
Object.defineProperty(exports, "NetworkFromTicker", { enumerable: true, get: function () { return network_2.NetworkFromTicker; } });
var account_1 = require("./account");
Object.defineProperty(exports, "CurveType", { enumerable: true, get: function () { return account_1.CurveType; } });
var keyring_2 = require("./keyring");
Object.defineProperty(exports, "HDKeyring", { enumerable: true, get: function () { return keyring_2.HDKeyring; } });
Object.defineProperty(exports, "defaultKeyringOptions", { enumerable: true, get: function () { return keyring_2.defaultKeyringOptions; } });
exports.defaultOptions = {
    // default path is BIP-44, where depth 5 is the address index
    path: "m/44'/60'/0'/0",
    strength: 128,
    mnemonic: null,
    network: (0, network_1.NetworkFromTicker)("eth"),
    passphrase: null,
    isCreation: true,
    xpub: null,
    isLocked: false
};
class HDSeedLoop {
    id;
    networkToKeyring = {};
    hdKey;
    xpub;
    mnemonic;
    mnemonicCipherText = null;
    isLocked = false;
    constructor(options = {}, networks = Object.values(network_1.defaultNetworks)) {
        const hdOptions = {
            ...exports.defaultOptions,
            ...options,
        };
        // usually runs when we deserialize a locked seedloop
        if (hdOptions.isLocked) {
            if (!hdOptions.xpub) {
                throw (new Error("Error: extended public key is missing. Needed when deserializing a locked seedloop."));
            }
            this.xpub = hdOptions.xpub;
            let newPubHdKey = hdkey_1.default.fromExtendedKey(this.xpub);
            this.id = (0, bs58_1.encode)(newPubHdKey.publicKey);
            this.isLocked = true;
            this.mnemonic = null;
            this.hdKey = null;
        }
        else {
            const mnemonic = (0, utils_1.validateAndFormatMnemonic)(hdOptions.mnemonic || (0, bip39_1.generateMnemonic)(hdOptions.strength));
            // if error occured when creating mnemonic
            if (!mnemonic) {
                throw new Error("Invalid mnemonic.");
            }
            this.mnemonic = mnemonic;
            this.hdKey = hdkey_1.default.fromMasterSeed((0, bip39_1.mnemonicToSeedSync)(this.mnemonic));
            this.xpub = this.hdKey.publicExtendedKey;
            this.id = (0, bs58_1.encode)(this.hdKey.publicKey);
            // populate seedloop with keyrings
            this.populateLoopKeyrings(networks);
        }
    }
    // populate seed loop with keyrings for supported Networks
    populateLoopKeyrings(networks = Object.values(network_1.defaultNetworks)) {
        if (!this.mnemonic || !this.hdKey) {
            throw Error("Invalid keyring, ensure keyring was defined and added to seedloop.");
        }
        for (const Network of networks) {
            // if the network is already on the seedloop.. move on to the next network
            if (this.networkOnSeedloop(Network))
                continue;
            // base hd path without child leaf
            let baseNetworkPath = (0, network_1.getBasePath)(Network.ticker, Network.chainId, Network.networkFamily);
            // new hd key used for adding keyring
            let newHdKey = this.hdKey.derive(baseNetworkPath);
            let ringOptions = {
                // default path is BIP-44 ethereum coin type
                basePath: baseNetworkPath,
                network: Network,
                xpub: newHdKey.publicExtendedKey
            };
            // create new key ring for Network given setup options
            var keyRing = new keyring_1.HDKeyring(ringOptions);
            const seed = (0, bip39_1.mnemonicToSeedSync)(this.mnemonic);
            // add init addresses sync.
            keyRing.addAddresses(seed);
            // add key ring to seed loop 
            this.addKeyRing(keyRing);
        }
    }
    networkOnSeedloop(network) {
        // account based families can share the same keyring
        // tx based families like bitcoin should have a distinct keyring for every network
        if (!network)
            throw (new Error("Error: network not provided. Unable to check if network is on seedloop."));
        switch (network.networkFamily) {
            case (network_1.NetworkFamily.Bitcoin): {
                return network.ticker in this.networkToKeyring;
            }
            case (network_1.NetworkFamily.EVM): {
                return constants_1.EVM_FAMILY_KEYRING_NAME in this.networkToKeyring;
            }
            case (network_1.NetworkFamily.Near): {
                return constants_1.NEAR_FAMILY_KEYRING_NAME in this.networkToKeyring;
            }
            case (network_1.NetworkFamily.Solana): {
                return constants_1.SOLANA_FAMILY_KEYRING_NAME in this.networkToKeyring;
            }
            case (network_1.NetworkFamily.Cosmos): {
                return constants_1.COSMOS_FAMILY_KEYRING_NAME in this.networkToKeyring;
            }
            default: {
                return false;
            }
        }
    }
    // SERIALIZE SEEDLOOP
    serialize() {
        let serializedKeyRings = [];
        // serialize the key ring for every coin that's on the seed loop and add to serialized list output
        for (let ticker in this.networkToKeyring) {
            let keyring = this.networkToKeyring[ticker];
            let serializedKeyRing = keyring.serialize();
            serializedKeyRings.push(serializedKeyRing);
        }
        return {
            version: 1,
            mnemonic: this.mnemonic,
            keyrings: serializedKeyRings,
            id: this.id,
            xpub: this.xpub,
            isLocked: this.isLocked
        };
    }
    static deserialize(obj) {
        const { version, mnemonic, keyrings, id, isLocked, xpub } = obj;
        if (version !== 1) {
            throw new Error(`Unknown serialization version ${obj.version}`);
        }
        // create loop options with pre-existing mnemonic
        // TODO add null check for mnemonic
        let loopOptions = {
            // default path is BIP-44 ethereum coin type, where depth 5 is the address index
            strength: 128,
            mnemonic: mnemonic,
            isCreation: false,
            isLocked: isLocked,
            xpub: xpub
        };
        // create seed loop that will eventually be returned.
        var seedLoopNew = new HDSeedLoop(loopOptions);
        // ensure HDnode matches original
        if (seedLoopNew.id != id)
            throw new Error("The deserialized keyring fingerprint does not match the original.");
        // deserialize keyrings
        for (const sk of keyrings) {
            const keyRing = keyring_1.HDKeyring.deserialize(sk);
            seedLoopNew.addKeyRing(keyRing);
        }
        return seedLoopNew;
    }
    // add keyring to dictionary and list of fellow key rings
    addKeyRing(keyring) {
        let network = keyring.network;
        switch (network.networkFamily) {
            case (network_1.NetworkFamily.Bitcoin): {
                this.networkToKeyring[network.ticker] = keyring;
                break;
            }
            case (network_1.NetworkFamily.EVM): {
                this.networkToKeyring[constants_1.EVM_FAMILY_KEYRING_NAME] = keyring;
                keyring;
                break;
            }
            case (network_1.NetworkFamily.Near): {
                this.networkToKeyring[constants_1.NEAR_FAMILY_KEYRING_NAME] = keyring;
                break;
            }
            case (network_1.NetworkFamily.Solana): {
                this.networkToKeyring[constants_1.SOLANA_FAMILY_KEYRING_NAME] = keyring;
                break;
            }
            default: {
                this.networkToKeyring[network.ticker] = keyring;
                break;
            }
        }
    }
    addKeyRingByNetwork(network) {
        // if keyring already available.. return it!
        if (this.networkOnSeedloop(network))
            return this.getKeyRing(network);
        let networkPath = network.path;
        if (network.networkFamily == network_1.NetworkFamily.EVM) {
            networkPath = exports.defaultOptions.path;
        }
        if (!this.mnemonic || !this.hdKey) {
            throw new Error("Error: No mnemonic exists on this seedloop. Required to add a keyring.");
        }
        let baseNetworkPath = (0, network_1.getBasePath)(network.ticker, network.networkFamily, network.networkFamily);
        let newHdKey = this.hdKey.derive(baseNetworkPath);
        let ringOptions = {
            // default path is BIP-44 ethereum coin type
            basePath: baseNetworkPath,
            network: network,
            xpub: newHdKey.publicExtendedKey
        };
        // create new key ring for Network given setup options
        var keyRing = new keyring_1.HDKeyring(ringOptions);
        let seed = (0, bip39_1.mnemonicToSeedSync)(this.mnemonic);
        // add init addresses sync.
        keyRing.addAddresses(seed);
        // add key ring to seed loop 
        this.addKeyRing(keyRing);
        return keyRing;
    }
    getAddresses(network) {
        let keyring = this.getKeyRing(network);
        if (!this.keyringValid(keyring))
            throw Error("Invalid keyring, ensure keyring was defined and added to seedloop.");
        let addresses = keyring.getAddresses();
        return addresses;
    }
    addAddresses(network, n) {
        // this error will throw if we have deserizlized a locked seedloop and try to add addresses
        // consumers can handle this error by casing om msg (checking for 'locked') and unlocking
        if (this.isLocked) {
            throw (new Error("Error: Seedloop is locked. Please unlock the seedloop, before adding addresses."));
        }
        if (!this.mnemonic) {
            throw new Error("Error: No mnemonic exists on this seedloop. Required for address generation.");
        }
        let keyring = this.getKeyRing(network);
        if (!this.keyringValid(keyring))
            throw Error("Invalid keyring, ensure keyring was defined and added to seedloop.");
        let seed = (0, bip39_1.mnemonicToSeedSync)(this.mnemonic);
        let addresses = keyring.addAddresses(seed, n);
        return addresses;
    }
    keyringValid(keyring) {
        return keyring != undefined;
    }
    getKeyRing(network) {
        let keyringToReturn;
        switch (network.networkFamily) {
            case (network_1.NetworkFamily.Bitcoin): {
                keyringToReturn = this.networkToKeyring[network.ticker];
                break;
            }
            case (network_1.NetworkFamily.EVM): {
                keyringToReturn = this.networkToKeyring[constants_1.EVM_FAMILY_KEYRING_NAME];
                break;
            }
            case (network_1.NetworkFamily.Near): {
                keyringToReturn = this.networkToKeyring[constants_1.NEAR_FAMILY_KEYRING_NAME];
                break;
            }
            case (network_1.NetworkFamily.Solana): {
                keyringToReturn = this.networkToKeyring[constants_1.SOLANA_FAMILY_KEYRING_NAME];
                break;
            }
            default: {
                keyringToReturn = this.networkToKeyring[network.ticker];
                break;
            }
        }
        if (!keyringToReturn)
            throw (new Error(`Error: Unable to retrieve keyring ${network.fullName}. Name not present in network map.`));
        return keyringToReturn;
    }
    signMessage(address, message, network) {
        if (this.isLocked) {
            throw (new Error("Error: Seedloop is locked. Please unlock the seedloop, before signing."));
        }
        if (!this.mnemonic) {
            throw new Error("Error: No mnemonic exists on this seedloop. Required for signatures.");
        }
        let keyring = this.getKeyRing(network);
        let seed = (0, bip39_1.mnemonicToSeedSync)(this.mnemonic);
        let signedMsg = keyring.signMessage(seed, address, message);
        return signedMsg;
    }
    // routes transaction to correct signer
    async signTransaction(address, transaction, network = network_1.defaultNetworks.eth) {
        if (this.isLocked) {
            throw (new Error("Error: Seedloop is locked. Please unlock the seedloop, before signing."));
        }
        if (!this.mnemonic) {
            throw new Error("Error: No mnemonic exists on this seedloop. Required for address generation.");
        }
        let keyring = this.getKeyRing(network);
        let seed = (0, bip39_1.mnemonicToSeedSync)(this.mnemonic);
        let signedTransaction = await keyring.signTransaction(address, seed, transaction);
        return signedTransaction;
    }
    // encrypts wallet seed with a given password
    lock(password) {
        if (!this.mnemonic) {
            // something must be wrong if locking with mnemonic as null
            throw new Error("Error: No mnemonic exists on this seedloop. Required to lock seedloop.");
        }
        const encryptedMnemonic = crypto_js_1.AES.encrypt(this.mnemonic, password).toString();
        this.isLocked = true;
        this.mnemonicCipherText = encryptedMnemonic;
        this.mnemonic = null;
        this.hdKey = null;
    }
    unlock(password) {
        // if already unlocked, return true
        if (!this.isLocked)
            return true;
        let formattedMnemonic;
        if (!this.mnemonicCipherText) {
            // we need the ciphertext to decrypt
            throw new Error("Error: No mnemonic ciphertext exists on this seedloop. P.");
        }
        try {
            const decryptedMnemonic = crypto_js_1.AES.decrypt(this.mnemonicCipherText, password).toString(crypto_js_1.enc.Utf8);
            formattedMnemonic = (0, utils_1.validateAndFormatMnemonic)(decryptedMnemonic);
        }
        /// unable to decrypt
        catch (e) {
            return false;
        }
        // not a valid mnemonic
        if (!formattedMnemonic)
            return false;
        // decryption worked! update state.
        this.mnemonic = formattedMnemonic;
        this.mnemonicCipherText = null;
        this.isLocked = false;
        return true;
    }
    // wrapper around mnemonic state, as mnemonic is a private variable
    getSeedPhrase() {
        return this.mnemonic;
    }
}
exports.default = HDSeedLoop;
//# sourceMappingURL=index.js.map