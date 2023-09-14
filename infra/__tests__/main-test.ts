// Copyright (c) HashiCorp, Inc
// SPDX-License-Identifier: MPL-2.0
import { App, TerraformStack, Testing } from "cdktf";
import "cdktf/lib/testing/adapters/jest"; // Load types for expect matchers
import { MacAddress } from "../constructs/MacAddress";
import { UnifiNetworkSetupStack } from "../stacks/UnifiNetworkSetupStack";
// import { Testing } from "cdktf";

describe("Test Helpers", () => {
  it("should allways generate the same name", () => {
    // given
    const app = new App();
    const stack = new TerraformStack(app, 'Stack');

    // when
    const mac1 = new MacAddress(stack, 'Mac1');

    // then
    expect( mac1.address ).toBe("AA:AA:53:6E:B4:6D");
  });

  it("should not accept the same name twice", () => {
    // given
    const app = new App();
    const stack = new TerraformStack(app, 'Stack');

    // when
    new MacAddress(stack, 'Mac1');

    // then
    expect( () => { new MacAddress(stack, 'Mac1') } ).toThrow("There is already a Construct with name 'Mac1' in TerraformStack");
  });

  it("test snapshot", () => {
    // given

    expect( 
      Testing.synthScope((app) => {
        const stack = new UnifiNetworkSetupStack(app, 'Stack', {
          sopsSecretsFile: 'test',
          remoteBackendOrganization: 'test',
        });
    
        stack.addNetwork({
          name: 'test',
          purpose: 'test',
        });
      })
    ).toMatchSnapshot();

  });
});
