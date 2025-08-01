import "dotenv/config"
import { deployContract, deployUpgradeableContract } from "./utils"
import { ERC20, MockMonad, PumpMonadStaking, PumpToken } from "../typechain-types"
import { parseEther } from "ethers"
import { ethers } from "hardhat"

async function main() {
  const [owner] = await ethers.getSigners()

  const wmonad = await deployContract("MockMonad", [], true) as MockMonad
  const pumpmonad = await deployContract("PumpToken", [], true) as PumpToken
  const pumpmonadstaking = await deployUpgradeableContract(
    "PumpMonadStaking", [await pumpmonad.getAddress(), await wmonad.getAddress()], true
  ) as PumpMonadStaking
  
  await pumpmonadstaking.setAllowNormalUnstake(true)
  await pumpmonadstaking.setAllowInstantUnstake(true)
  await pumpmonadstaking.setAllowClaim(true)
  await pumpmonadstaking.setStakeAssetCap(await parseEther("10000"))
  
  await pumpmonad.setMinter(await pumpmonadstaking.getAddress(), true)

  await wmonad.mint(owner.address, parseEther("10000"))
  await wmonad.approve(await pumpmonadstaking.getAddress(), parseEther("10000"))

  await pumpmonadstaking.stake({ value: parseEther("100") })
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

