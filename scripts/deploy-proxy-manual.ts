import "dotenv/config"
import { deployContract } from "./utils"
import { PumpHypeStaking, PumpToken } from "../typechain-types"
import { parseEther } from "ethers"
import { ethers } from "hardhat"

async function main() {
  const [admin] = await ethers.getSigners()

  const pumphype = await ethers.getContractAt(
    "PumpToken", process.env.MONADTEST_PUMP_TOKEN!
  ) as PumpToken

  const proxy = await deployContract("TransparentUpgradeableProxy", [
    process.env.MONADTEST_MONAD_STAKING_IMPL!,
    admin.address,
    "0xc4d66de8" + "000000000000000000000000" + (await pumphype.getAddress()).slice(2),
      // selector for `initialize(address pumpTokenAddress)`
  ], true)
  const pumphypestaking = await ethers.getContractAt(
    "PumpHypeStaking", await proxy.getAddress()
  ) as PumpHypeStaking
  await pumphype.setMinter(await proxy.getAddress(), true)

  await pumphypestaking.setAllowNormalUnstake(true)
  await pumphypestaking.setAllowInstantUnstake(true)
  await pumphypestaking.setAllowClaim(true)
  await pumphypestaking.setStakeAssetCap(parseEther("10000"))
  await pumphypestaking.stake({ value: parseEther("0.001") })
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

