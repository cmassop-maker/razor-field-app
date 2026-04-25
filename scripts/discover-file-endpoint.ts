/**
 * Script to discover the correct file upload endpoint from Razor ERP Swagger docs.
 * Run: npx tsx scripts/discover-file-endpoint.ts
 */
import axios from "axios";

const BASE_URL = "https://monwire.razorerp.com";

async function discoverEndpoints() {
  // Try to fetch Swagger/OpenAPI spec
  const swaggerPaths = [
    "/swagger/v1/swagger.json",
    "/swagger/swagger.json",
    "/api-docs",
    "/swagger.json",
    "/api/swagger.json",
  ];

  for (const path of swaggerPaths) {
    try {
      console.log(`Trying: ${BASE_URL}${path}`);
      const res = await axios.get(`${BASE_URL}${path}`, { timeout: 10000 });
      const spec = res.data;
      
      if (spec.paths) {
        console.log("\n=== Found API Spec ===");
        // Find all endpoints related to files or uploads
        const fileEndpoints = Object.entries(spec.paths).filter(([path]) => 
          path.toLowerCase().includes("file") || 
          path.toLowerCase().includes("upload") ||
          path.toLowerCase().includes("attachment") ||
          path.toLowerCase().includes("document")
        );
        
        console.log("\nFile-related endpoints:");
        for (const [path, methods] of fileEndpoints) {
          const methodNames = Object.keys(methods as any).filter(m => m !== "parameters");
          console.log(`  ${methodNames.map(m => m.toUpperCase()).join(", ")} ${path}`);
          // Show details for POST methods
          for (const method of methodNames) {
            if (method === "post" || method === "put") {
              const detail = (methods as any)[method];
              if (detail.parameters) {
                console.log(`    Parameters: ${JSON.stringify(detail.parameters.map((p: any) => ({ name: p.name, in: p.in, type: p.type || p.schema?.type })))}`);
              }
              if (detail.requestBody) {
                console.log(`    RequestBody: ${JSON.stringify(detail.requestBody)}`);
              }
              if (detail.consumes) {
                console.log(`    Consumes: ${detail.consumes}`);
              }
            }
          }
        }

        // Also find InboundOrder endpoints
        const orderEndpoints = Object.entries(spec.paths).filter(([path]) => 
          path.toLowerCase().includes("inboundorder")
        );
        
        console.log("\nInboundOrder endpoints:");
        for (const [path, methods] of orderEndpoints) {
          const methodNames = Object.keys(methods as any).filter(m => m !== "parameters");
          console.log(`  ${methodNames.map(m => m.toUpperCase()).join(", ")} ${path}`);
        }
      }
      
      return; // Found spec, done
    } catch (e: any) {
      console.log(`  Failed: ${e?.response?.status || e.message}`);
    }
  }
  
  console.log("\nCould not find Swagger spec. Trying direct endpoint discovery...");
  
  // Try common file upload endpoints without auth to see which return 401 (exists) vs 404 (doesn't exist)
  const testEndpoints = [
    "/api/v1/File",
    "/api/v1/File/upload",
    "/api/v1/Files",
    "/api/v1/Attachment",
    "/api/v1/Attachments",
    "/api/v1/Document",
    "/api/v1/InboundOrder/2624/file",
    "/api/v1/InboundOrder/2624/files",
    "/api/v1/InboundOrder/2624/attachment",
    "/api/v1/InboundOrder/2624/attachments",
    "/api/v1/InboundOrder/2624/document",
    "/api/v1/InboundOrder/2624/documents",
    "/api/v1/InboundOrder/file-upload/2624",
    "/api/v1/File/inbound-order/2624",
    "/api/v1/InboundOrder/2624/add-file",
    "/api/v1/InboundOrder/2624/upload",
  ];
  
  for (const endpoint of testEndpoints) {
    try {
      const res = await axios.get(`${BASE_URL}${endpoint}`, { timeout: 5000 });
      console.log(`  ${endpoint} -> ${res.status} (EXISTS - accessible without auth!)`);
    } catch (e: any) {
      const status = e?.response?.status;
      if (status === 401) {
        console.log(`  ${endpoint} -> 401 (EXISTS - needs auth)`);
      } else if (status === 404) {
        console.log(`  ${endpoint} -> 404 (not found)`);
      } else if (status === 405) {
        console.log(`  ${endpoint} -> 405 (method not allowed - endpoint exists but needs POST)`);
      } else {
        console.log(`  ${endpoint} -> ${status || e.message}`);
      }
    }
  }
}

discoverEndpoints().catch(console.error);
