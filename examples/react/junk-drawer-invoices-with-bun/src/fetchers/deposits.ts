import axios from "axios";

export const fetchDeposit = async (depositId: string) => {
  console.log(`Fetching deposit by id ${depositId}...`);
  await new Promise((r) => setTimeout(r, 500));
  return await axios
    .get<any>(`http://localhost:8080/deposits/${depositId}`)
    .then((r) => r.data);
};
