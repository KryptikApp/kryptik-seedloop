import { NetworkFromTicker } from "../src/network";
import HDSeedLoop from "../src";
import { expect, describe, it } from 'vitest'
import { TransactionRequest } from "@ethersproject/abstract-provider";
import { serialize, UnsignedTransaction, recoverAddress, parse } from "@ethersproject/transactions";
import { keccak256 } from "ethereumjs-util";
import { hashMessage } from "@ethersproject/hash";

const validMnemonics = [
  "square time hurdle gospel crash uncle flash tomorrow city space shine sad fence ski harsh salt need edit name fold corn chuckle resource else",
  "until issue must",
  "glass skin grass cat photo essay march detail remain",
  "dream dinosaur poem cherry brief hand injury ice stuff steel bench vacant amazing bar uncover",
  "mad such absent minor vapor edge tornado wrestle convince shy battle region adapt order finish foot follow monitor",
]

const validDerivations = [
  {
    mnemonic:
      "square time hurdle gospel crash uncle flash tomorrow city space shine sad fence ski harsh salt need edit name fold corn chuckle resource else",
    addresses: [
      "0xca19be978a1d2456d16bde3efb0a5b8946f4a1ce",
      "0xce73b34e2cdf4e00054c509cc5fdf3882d4a87c8",
      "0x0b5446d680c0e665ee63508237337c8a9fe31361",
      "0x342097b215dacc397b7adc11eb54257f6bcb680e",
      "0x53e5caff572f5d16ae00054a77a252a636e56700",
      "0x17e02708eeaa9fc8c6ed86b08af1ea2e81cf18f9",
      "0x4a8d4ad7206c24a1c7e694760dbd35df33068401",
      "0x2d43d1f8f96ff679511209280617a146b049a999",
      "0xf260e5482cc567f04f42f6229b694f3a38721ed9",
      "0xcd29ee2e1fb20fa948451fb66316da280251c439",
    ],
  },
  {
    mnemonic:
      "brain surround have swap horror body response double fire dumb bring hazard",
    addresses: [
      "0x7b4322b9abe447ce86faa6121b35c84ec36945ad",
      "0x33a77a26b8523bf21bfd63f81c77f495627304e3",
      "0x2614fdc904520631f0a24ac3360393e48359fe78",
      "0xd317dcc257bedf8868b8b41a3f053604e08d3618",
      "0x0b87d62bec983a9d7832f560377e8a0876fba9cc",
      "0x6208e7af335ea9422e703b1e688b0e7f17a44a87",
      "0x74502255857e5fc38945cd6391818726fd9117e5",
      "0xc3c542dd8057f1c4a92e0bf6aa0248ed37825472",
      "0xa20ac021efb093f7f56d1e2cff31cca1c6ecac02",
      "0x260268b1cb9f4b9f6269d6051300057e3a8e1cb5",
    ],
  },
]

const testPassphrases = ["super_secret", "1234"]

const twelveOrMoreWordMnemonics = validMnemonics.filter(
  (m) => m.split(" ").length >= 12
)

const underTwelveWorkMnemonics = validMnemonics.filter(
  (m) => m.split(" ").length < 12
)

describe("Test Seedloop Features", () => {

  it("cannot be constructed with an invalid mnemonic", () => {
    underTwelveWorkMnemonics.forEach((m) =>
      expect(() => new HDSeedLoop({ mnemonic: m })).toThrowError()
    )
  })

  it("initializes the same first addresses from the same mnemonic", async () => {
    await Promise.all(
      twelveOrMoreWordMnemonics.map(async (m) => {
        const seedloop1 = new HDSeedLoop({ mnemonic: m })
        const seedloop2 = new HDSeedLoop({ mnemonic: m })
        let networkSol = NetworkFromTicker("sol");
        expect((await seedloop1.getAddresses(networkSol)).length).toEqual(1)
        expect((await seedloop2.getAddresses(networkSol)).length).toEqual(1)
        expect(seedloop1.getAddresses(networkSol)).toStrictEqual(
          seedloop2.getAddresses(networkSol)
        )

      })
    )
  })

  it("generates same EVM address as legacy wallets", () => {
    validDerivations.map((m) => {
      const seedloop = new HDSeedLoop({ mnemonic: m.mnemonic })
      const networkEth = NetworkFromTicker("eth");
      seedloop.addAddresses(networkEth);
      const addresses = seedloop.getAddresses(networkEth);
      // test first and second addresses
      expect(addresses[0]).toEqual(m.addresses[0].toLowerCase());
      expect(addresses[1]).toEqual(m.addresses[1].toLowerCase());
    })
})


  it("deserializes after serializing", async () => {
    await Promise.all(
      twelveOrMoreWordMnemonics.map(async (m) => {
        const seedloop = new HDSeedLoop({ mnemonic: m })
        const id1 = seedloop.id

        const serialized = await seedloop.serialize()
        const deserialized = HDSeedLoop.deserialize(serialized)

        expect(id1).toBe(deserialized.id)
      })
    )
  })

  it("fails to deserialize different versions", async () => {
    await Promise.all(
      twelveOrMoreWordMnemonics.map(async (m) => {
        const seedLoop = new HDSeedLoop({ mnemonic: m })
        const serialized = await seedLoop.serialize()
        serialized.version = 2
        expect(() => HDSeedLoop.deserialize(serialized)).toThrowError()
      })
    )
  })


  it("generates the same IDs from the same mnemonic", async () => {
    twelveOrMoreWordMnemonics.forEach((m) => {
      const keyring1 = new HDSeedLoop({ mnemonic: m })
      const keyring2 = new HDSeedLoop({ mnemonic: m })
      expect(keyring1.id).toBe(keyring2.id)
    })
  })

  it("signs EVM transactions recoverably", async () => {
    await Promise.all(
      twelveOrMoreWordMnemonics.map(async (m) => {
        const keyring = new HDSeedLoop({ mnemonic: m })
        const networkEth = NetworkFromTicker("eth");
        const addresses = await keyring.addAddresses(networkEth, 1)
        for(const address of addresses){
          const tx: TransactionRequest = {
            to: "0x0000000000000000000000000000000000000000",
            from:address,
            value: 300000,
            gasLimit: 300000,
            gasPrice: 300000,
            nonce: 300000,
          }
          const signedTx = await keyring.signTransaction(address, {evmTransaction:tx}, networkEth)
          expect(signedTx.evmFamilyTx).toBeDefined();
          if(!signedTx.evmFamilyTx) return;
          const parsed = parse(signedTx.evmFamilyTx)
          const sig = {
            r: parsed.r as string,
            s: parsed.s as string,
            v: parsed.v as number,
          }
          // workaround ethers object key issue
          if(tx.from){
            delete tx.from
          }
          const digest = keccak256(Buffer.from(serialize(<UnsignedTransaction>tx)));
          let recoveredAddress = recoverAddress(digest, sig).toLowerCase();
          expect(recoveredAddress).toEqual(address)
        }
      })
    )
  })

  it("generates the same addresses from the same mnemonic", async () => {
    await Promise.all(
      twelveOrMoreWordMnemonics.map(async (m) => {
        const seedloop1 = new HDSeedLoop({ mnemonic: m })
        const seedloop2 = new HDSeedLoop({ mnemonic: m })
        // using NEAR network in this case... can subsititute any other
        let networkNear = NetworkFromTicker("near");
        expect((await seedloop1.getAddresses(networkNear)).length).toBeGreaterThan(0)
        expect((await seedloop2.getAddresses(networkNear)).length).toBeGreaterThan(0)

        expect(seedloop1.getAddresses(networkNear)).toStrictEqual(
          seedloop2.getAddresses(networkNear)
        )
      })
    )
  })

  it("signs messages recoverably with EVM networks", () => {
      validDerivations.map((m) => {
        const seedloop = new HDSeedLoop({ mnemonic: m.mnemonic })
        const networkEth = NetworkFromTicker("eth");
        const addresses = seedloop.getAddresses(networkEth);
        for(const address of addresses){
          const message = "recoverThisMessage"
          const sig = seedloop.signMessage(address, message, networkEth);
          let recoveredAddress = recoverAddress(hashMessage(message), sig).toLowerCase();
          expect(recoveredAddress).toEqual(address)
        }
      })
  })

  it(("locks and unlocks seedloop"), ()=>{
    const originalMnemonic = validMnemonics[0];
    let seedloop =  new HDSeedLoop({ mnemonic: validMnemonics[0] });
    for(const passphrase of testPassphrases){
      seedloop.lock(passphrase);
      let mnemonic = seedloop.getSeedPhrase()
      expect(mnemonic).toBeNull();
      let unlocked = seedloop.unlock(passphrase);
      expect(unlocked).toBeTruthy();
      mnemonic = seedloop.getSeedPhrase()
      expect(mnemonic).toEqual(originalMnemonic);
    }
  })

  it(("locks and unlocks seedloop. can then create proper signature."), ()=>{
    const originalMnemonic = validMnemonics[0];
    let seedloop =  new HDSeedLoop({ mnemonic: validMnemonics[0] });
    for(const passphrase of testPassphrases){
      seedloop.lock(passphrase);
      let mnemonic = seedloop.getSeedPhrase()
      expect(mnemonic).toBeNull();
      let unlocked = seedloop.unlock(passphrase);
      expect(unlocked).toBeTruthy();
      mnemonic = seedloop.getSeedPhrase()
      expect(mnemonic).toEqual(originalMnemonic);
      // test signature after unlock
      const networkEth = NetworkFromTicker("eth");
      const addresses = seedloop.getAddresses(networkEth);
      for(const address of addresses){
        const message = "recoverThisMessage"
        const sig = seedloop.signMessage(address, message, networkEth);
        let recoveredAddress = recoverAddress(hashMessage(message), sig).toLowerCase();
        expect(recoveredAddress).toEqual(address)
      }
    }
  })

  it(("can fetch addresses from locked seedloop"), ()=>{
    let seedloop =  new HDSeedLoop({ mnemonic: validMnemonics[0] });
    let networkNear = NetworkFromTicker("near");
    let passphrase = "testingphrase"
    let unlockedAddresses = seedloop.getAddresses(networkNear);
    seedloop.lock(passphrase);
    let lockedAddresses = seedloop.getAddresses(networkNear);
    expect(lockedAddresses).toStrictEqual(unlockedAddresses);
  })


  it(("can serialize and deserialize locked seedloop with addresses"), ()=>{
    let seedloop =  new HDSeedLoop({ mnemonic: validMnemonics[0] });
    let networkNear = NetworkFromTicker("near");
    let passphrase = "testingphrase"
    let unlockedAddresses = seedloop.getAddresses(networkNear);
    // lock and serialize
    seedloop.lock(passphrase);
    let serializedloop = seedloop.serialize();
    // deserialize
    seedloop = HDSeedLoop.deserialize(serializedloop);
    let lockedAddresses = seedloop.getAddresses(networkNear);
    expect(lockedAddresses).toStrictEqual(unlockedAddresses);
  })

  it(("can unlock seedloop that was serialized when locked"), ()=>{
    let seedloop =  new HDSeedLoop({ mnemonic: validMnemonics[0] });
    let passphrase = "testingphrase"
    // lock and serialize
    seedloop.lock(passphrase);
    let serializedloop = seedloop.serialize();
    // deserialize
    seedloop = HDSeedLoop.deserialize(serializedloop);
    let unlocked = seedloop.unlock(passphrase);
    expect(unlocked).toBeTruthy();
  })

  it(("fails to unlock with wrong passphrase"), ()=>{
    let seedloop =  new HDSeedLoop({ mnemonic: validMnemonics[0] });
    let passphrase = "testingphrase"
    // lock seedloop
    seedloop.lock(passphrase);
    // unlock with wrong password
    let unlocked = seedloop.unlock("wrong")
    expect(unlocked).toBeFalsy();
  })

});