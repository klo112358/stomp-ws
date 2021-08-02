import chai, { expect } from "chai"
import chaiThings from "chai-things"
import chaiPromise from "chai-as-promised"

import { encode } from "../src/client/index"
import { decode } from "../src/server/index"

chai.should()
chai.use(chaiThings)
chai.use(chaiPromise)

describe("Test Encode", () => {
  it("should be equal", () => {
    console.log(
      decode(
        encode({
          command: "CONNECT",
        }),
      ),
    )
  })
})
