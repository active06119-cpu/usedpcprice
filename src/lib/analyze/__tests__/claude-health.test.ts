import { classifyAnthropicStatus, keyPrefixProbe } from "@/lib/analyze/claude";

// keyPrefixOf is not exported; classify is enough for unit coverage.
describe("classifyAnthropicStatus", () => {
  it("maps auth and billing failures", () => {
    expect(classifyAnthropicStatus(401, "authentication_error")).toBe("invalid_api_key");
    expect(classifyAnthropicStatus(403, "permission_error")).toBe("no_permission");
    expect(classifyAnthropicStatus(404, "not_found_error")).toBe("model_or_route_not_found");
    expect(classifyAnthropicStatus(429, "rate_limit_error")).toBe("rate_limited");
    expect(classifyAnthropicStatus(400, "invalid_request_error")).toBe("invalid_request");
    expect(classifyAnthropicStatus(529, "overloaded_error")).toBe("overloaded");
  });
});
