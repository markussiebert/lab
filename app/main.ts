import { App } from 'cdktf';
import { SideroSingleNodeClusterStack } from '../stacks/SideroSingleNodeClusterStack';
import { UnifiNetworkSetup } from '../stacks/UnifiNetworkSetup';

const app = new App();
new UnifiNetworkSetup(app, 'UnifiNetworkSetup');
new SideroSingleNodeClusterStack(app, 'SideroVM');
app.synth();
