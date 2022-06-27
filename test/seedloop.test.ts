import HDSeedLoop from "../src"
import { defaultNetworks, Network} from "../src/network";

const validMnemonics = [
  "square time hurdle gospel crash uncle flash tomorrow city space shine sad fence ski harsh salt need edit name fold corn chuckle resource else",
  "until issue must",
  "glass skin grass cat photo essay march detail remain",
  "dream dinosaur poem cherry brief hand injury ice stuff steel bench vacant amazing bar uncover",
  "mad such absent minor vapor edge tornado wrestle convince shy battle region adapt order finish foot follow monitor",
]

const testPassphrases = ["super_secret", "1234"]
const twelveOrMoreWordMnemonics = validMnemonics.filter(
  (m) => m.split(" ").length >= 12
)

const underTwelveWorkMnemonics = validMnemonics.filter(
  (m) => m.split(" ").length < 12
)

describe("SeedLoop", () => {
    it("Creates a defined seedlopp", ()=>{
      const seedLoop = new HDSeedLoop()
        console.log(seedLoop);
        expect(seedLoop).toBeDefined()
    })
    it("Keyrings can be constructed without a mnemonic", () => {
        const seedLoop = new HDSeedLoop()
        expect(seedLoop).toBeDefined()
        seedLoop.getKeyRing(defaultNetworks["btc"]).then((keyRing)=>{
            expect(keyRing.id).toBeTruthy()
            expect(keyRing.id.length).toBeGreaterThan(9)
        });
      })
      it("can be constructed with a mnemonic", () => {
        const seedLoop = new HDSeedLoop({
          mnemonic: validMnemonics[0],
        })
        seedLoop.getKeyRing(defaultNetworks["btc"]).then((keyRing)=>{
            expect(keyRing.id).toBeTruthy()
            expect(keyRing.id.length).toBeGreaterThan(9)
        });
      })
      it("can be constructed with a mnemonic and passphrase", () => {
        const seedLoop = new HDSeedLoop({
          mnemonic: validMnemonics[0],
          passphrase: testPassphrases[0],
        })
        expect(seedLoop.id).toBeTruthy()
        expect(seedLoop.id.length).toBeGreaterThan(9)
      })
      it("cannot be constructed with an invalid mnemonic", () => {
        underTwelveWorkMnemonics.forEach((m) =>
          expect(() => new HDSeedLoop({ mnemonic: m })).toThrowError()
        )
      })
      it("serializes its mnemonic", async () => {
        await Promise.all(
          twelveOrMoreWordMnemonics.map(async (m) => {
            const seedLoop = new HDSeedLoop({ mnemonic: m })
            const serialized = await seedLoop.serialize()
            expect(serialized.mnemonic).toBe(m)
          })
        )
      })
      it("deserializes after serializing", async () => {
        await Promise.all(
          twelveOrMoreWordMnemonics.map(async (m) => {
            const seedLoop = new HDSeedLoop({ mnemonic: m })
            const id1 = seedLoop.id
    
            const serialized = await seedLoop.serialize()
            const deserialized = HDSeedLoop.deserialize(serialized)
    
            expect(id1).toBe(deserialized.id)
          })
        )
      })
      it("generates distinct addresses", async () => {
        const allAddresses: string[] = []
        await Promise.all(
          twelveOrMoreWordMnemonics.map(async (m) => {
            const seedLoop = new HDSeedLoop({ mnemonic: m })
            let addysInit = await seedLoop.getAddresses(defaultNetworks["eth"]);
            await seedLoop.addAddresses(defaultNetworks["eth"], 10)
            const addresses = await seedLoop.getAddresses(defaultNetworks["eth"])
            expect(addresses.length).toEqual(addysInit.length + 10)
            expect(new Set(addresses).size).toEqual(addysInit.length+10)
    
            allAddresses.concat(addresses)
          })
        )
        expect(new Set(allAddresses).size).toEqual(allAddresses.length)
      })
      it("generates all default keyrings with single initialized address", async () => {
        const seedLoop = new HDSeedLoop();
        let loopKeyrings = seedLoop.getAllKeyrings();
        console.log("NUMBER OF KEYRINGS ON DEFAULT SEEDLOOP:");
        console.log(loopKeyrings.length);
        loopKeyrings.forEach(async lk => {
            let addys = await lk.getAddresses();
            console.log(`${lk.network.fullName} Addresses:`);
            console.log(addys);
            expect(addys.length).toEqual(1);
        });
      })
      it("adds all keyrings to seedloop", async () => {
        const seedLoop = new HDSeedLoop();
        let networks:Network[] = Object.values(defaultNetworks);
        for (const nw of networks) {
          expect(seedLoop.networkOnSeedloop(defaultNetworks[nw.ticker])).toBeTruthy();
        }
      })
      // it("signs bitcoin transaction correctly", async () => {
      //   const seedLoop = new HDSeedLoop();
      //   const psbt = new bitcoin.Psbt();
      //   psbt.setVersion(2); // These are defaults. This line is not needed.
      //   psbt.setLocktime(0); // These are defaults. This line is not needed.
      //   psbt.addInput({
      //     // if hash is string, txid, if hash is Buffer, is reversed compared to txid
      //     hash: '7d067b4a697a09d2c3cff7d4d9506c9955e93bff41bf82d439da7d030382bc3e',
      //     index: 0,
      //     sequence: 0xffffffff, // These are defaults. This line is not needed.
    
      //     // non-segwit inputs now require passing the whole previous tx as Buffer
      //     nonWitnessUtxo: Buffer.from(
      //       '0200000001f9f34e95b9d5c8abcd20fc5bd4a825d1517be62f0f775e5f36da944d9' +
      //         '452e550000000006b483045022100c86e9a111afc90f64b4904bd609e9eaed80d48' +
      //         'ca17c162b1aca0a788ac3526f002207bb79b60d4fc6526329bf18a77135dc566020' +
      //         '9e761da46e1c2f1152ec013215801210211755115eabf846720f5cb18f248666fec' +
      //         '631e5e1e66009ce3710ceea5b1ad13ffffffff01' +
      //         // value in satoshis (Int64LE) = 0x015f90 = 90000
      //         '905f010000000000' +
      //         // scriptPubkey length
      //         '19' +
      //         // scriptPubkey
      //         '76a9148bbc95d2709c71607c60ee3f097c1217482f518d88ac' +
      //         // locktime
      //         '00000000',
      //       'hex',
      //     ),
      //   });
      //   psbt.addOutput({
      //     address: '1KRMKfeZcmosxALVYESdPNez1AP1mEtywp',
      //     value: 80000,
      //   });
      //   // btc network
      //   let btcNetwork = defaultNetworks.btc;
      //   // btc address
      //   let btcAddysAll:string[] = await seedLoop.getAddresses(btcNetwork);
      //   let btcAddy:string = btcAddysAll[0];
      //   expect(await seedLoop.signTransaction(btcAddy, {btcTransaction:psbt}, defaultNetworks.btc)).toHaveReturned();
      // })
});
