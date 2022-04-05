import HDSeedLoop from "../src"
import { defaultNetworks } from "../src/network";

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
            const keyring = new HDSeedLoop({ mnemonic: m })
    
            await keyring.addAddresses(defaultNetworks["eth"], 10)
    
            const addresses = await keyring.getAddresses(defaultNetworks["eth"])
            expect(addresses.length).toEqual(10)
            expect(new Set(addresses).size).toEqual(10)
    
            allAddresses.concat(addresses)
          })
        )
        expect(new Set(allAddresses).size).toEqual(allAddresses.length)
      })
});
