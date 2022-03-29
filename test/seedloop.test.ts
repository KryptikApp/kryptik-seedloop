import HDSeedLoop from "../src"
import { defaultNetworks } from "../src/network";

const validMnemonics = [
  "square time hurdle gospel crash uncle flash tomorrow city space shine sad fence ski harsh salt need edit name fold corn chuckle resource else",
  "until issue must",
  "glass skin grass cat photo essay march detail remain",
  "dream dinosaur poem cherry brief hand injury ice stuff steel bench vacant amazing bar uncover",
  "mad such absent minor vapor edge tornado wrestle convince shy battle region adapt order finish foot follow monitor",
]

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
});
