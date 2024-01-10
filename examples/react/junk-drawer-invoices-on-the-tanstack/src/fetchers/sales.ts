import axios from "axios";

export const fetchFirstData = async () => {
  console.log("Fetching posts...");
  await new Promise((r) => setTimeout(r, 500));
  return await axios
    .get<any>("http://localhost:8080/first-data-info")
    .then((r) => r);
};
