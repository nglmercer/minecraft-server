import { ApiRouter, ApiRequest } from "../src/utils/api-handler";

async function testRouter() {
  const router = new ApiRouter();

  // Middleware test
  let middlewareCalled = false;
  router.use((ctx) => {
    middlewareCalled = true;
  });

  // GET route test
  router.get("/test", (ctx) => {
    return ApiRequest.json({ success: true, message: "Hello world" });
  });

  // POST route test with body
  router.post("/echo", async (ctx) => {
    const body = await ctx.json();
    return ApiRequest.json({ body });
  });

  // Simulate Request
  const req1 = new Request("http://localhost:3000/test", { method: "GET" });
  const res1 = await router.handle(req1);
  const data1 = await res1?.json();
  console.log("GET /test result:", data1);
  console.log("Middleware called:", middlewareCalled);

  const req2 = new Request("http://localhost:3000/echo", { 
    method: "POST", 
    body: JSON.stringify({ hello: "world" }),
    headers: { "Content-Type": "application/json" }
  });
  const res2 = await router.handle(req2);
  const data2 = await res2?.json();
  console.log("POST /echo result:", data2);

  // Error case
  const req3 = new Request("http://localhost:3000/not-found", { method: "GET" });
  const res3 = await router.handle(req3);
  console.log("GET /not-found result:", res3 === undefined ? "404" : "error");

  if (data1?.success === true && middlewareCalled === true && data2?.body?.hello === "world" && res3 === undefined) {
    console.log("Router tests PASSED");
  } else {
    console.error("Router tests FAILED");
    process.exit(1);
  }
}

testRouter();
