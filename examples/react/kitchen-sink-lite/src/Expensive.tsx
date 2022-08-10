import * as React from "react";
import { tw } from "twind";

export default function Expensive() {
  return (
    <div className={tw`p-2`}>
      I am an "expensive" component... which really just means that I was
      code-split 😉
    </div>
  );
}
