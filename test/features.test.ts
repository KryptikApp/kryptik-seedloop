import { NetworkFromTicker } from "../src/network";
import HDSeedLoop from "../src";
import { KeyPairEd25519, PublicKey } from "near-api-js/lib/utils/key_pair";
import { baseEncode } from "borsh";



describe("Features", () => {
      it("test creates near address", async () => {      
        const seedLoop = new HDSeedLoop();
        let network = NetworkFromTicker("near");
        let keyRing = seedLoop.getKeyRingSync(network);
        keyRing.addAddressesSync(1);
        let addy = keyRing.getAddressesSync()[0];
        let wallet = seedLoop.getWalletForAddress(network, addy);
        if(!wallet) return;
        let keyPair = wallet.createKeyPair();
        let nearKey = new KeyPairEd25519(baseEncode(keyPair.secretKey))
        console.log(nearKey.publicKey.toString());
        console.log(baseEncode(keyPair.publicKey));
        let pubAddy = nearKey.publicKey.toString();
        let pubkey = PublicKey.fromString(pubAddy);
      });
});