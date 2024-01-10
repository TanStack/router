import axios from "axios";
import { Deposit } from "../../models/depositserver";

export const fetchDeposit = async (depositId: string) => {
  console.log(`Fetching deposit by id ${depositId}...`);
  await new Promise((r) => setTimeout(r, 500));
  return await axios
    .get<Record<"depositDetails", Deposit>>(
      `http://localhost:8080/deposits/${depositId}`
    )
    .then((r) => r.data);
};
