import { App } from 'cdktf';
import {
  RemoteBackendStack,
  RemoteBackendStackProps,
} from './RemoteBackendStack';
import * as tfe from '../.gen/providers/tfe';

export class RemoteBackendHandlerStack extends RemoteBackendStack {
  readonly stackName: string;

  constructor(scope: App, name: string, props: RemoteBackendStackProps) {
    super(scope, name, props);

    this.stackName = name;

    new tfe.provider.TfeProvider(this, 'TfeProvider');
  }
}