const Server = require("./dist/server/index")
const express = require("express")
const http = require("http")
const cors = require("cors")

const app = express()
app.use(cors())

const server = http.createServer(app)

const wss = new Server({
  server: server,
  path: "/ws",
  getSession: (frame) => {
    return "1"
  },
  onClose: (session) => {},
})

wss.start()

server.listen(9000)
