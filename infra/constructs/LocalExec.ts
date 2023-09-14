import { Construct } from 'constructs';
import * as nullProvider from '@cdktf/provider-null';
import { ITerraformDependable } from 'cdktf';

export interface LocalExecProps {
  readonly workingDir?: string;
  readonly command: string;
  readonly environment?: { [key: string]: string };
  readonly dependsOn?: ITerraformDependable[];
}

export class LocalExec extends Construct implements ITerraformDependable {

  public readonly fqn: string;
  constructor(scope: Construct, name: string, props: LocalExecProps) {
    super(scope, name);
    

    new nullProvider.provider.NullProvider(this, 'NullProvider');

    const dummyResource = new nullProvider.resource.Resource(this, name, {
        dependsOn: props.dependsOn,
    });

    dummyResource.addOverride('provisioner', [
      {
        'local-exec': {
          working_dir: props.workingDir,
          command: props.command,
          environment: props.environment,
        },
      },
    ]);
    this.fqn = dummyResource.fqn;
  }
  
}
