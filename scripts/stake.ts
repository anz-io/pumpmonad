import "dotenv/config"
import { PumpMonadStaking } from "../typechain-types"
import { parseEther } from "ethers"
import { ethers } from "hardhat"

async function main() {
  const pumpmonadstaking = await ethers.getContractAt(
    "PumpMonadStaking", "0xd89318D6F723fc1aeb368F83e789d65b8dAAc516"
  ) as PumpMonadStaking
  await pumpmonadstaking.stake({ value: parseEther("0.001") })
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

