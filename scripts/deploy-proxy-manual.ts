import "dotenv/config"
import { deployContract } from "./utils"
import { PumpMonadStaking, PumpToken } from "../typechain-types"
import { parseEther } from "ethers"
import { ethers } from "hardhat"

async function main() {
  const [admin] = await ethers.getSigners()

  const pumpmonad = await ethers.getContractAt(
    "PumpToken", process.env.MONADTEST_PUMP_TOKEN!
  ) as PumpToken

  const proxy = await deployContract("TransparentUpgradeableProxy", [
    process.env.MONADTEST_MONAD_STAKING_IMPL!,
    admin.address,
    "0xc4d66de8" + "000000000000000000000000" + (await pumpmonad.getAddress()).slice(2),
      // selector for `initialize(address pumpTokenAddress)`
  ], true)
  const pumpmonadstaking = await ethers.getContractAt(
    "PumpMonadStaking", await proxy.getAddress()
  ) as PumpMonadStaking
  await pumpmonad.setMinter(await proxy.getAddress(), true)

  await pumpmonadstaking.setAllowNormalUnstake(true)
  await pumpmonadstaking.setAllowInstantUnstake(true)
  await pumpmonadstaking.setAllowClaim(true)
  await pumpmonadstaking.setStakeAssetCap(parseEther("10000"))
  await pumpmonadstaking.stake({ value: parseEther("0.001") })
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

