export {}

const res = await fetch("http://localhost:5600/stopServer", {
	method: "POST",
})

console.log("Port handler server stopped:", res.ok ? "Success" : "Failed")
