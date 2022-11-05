import { ITerraformDependable } from "cdktf";
import { Construct } from "constructs";
import * as proxmox from "../.gen/providers/proxmox";
import { sleep } from "../.gen/providers/time";
import * as time from '../.gen/providers/time'

export interface ProxmoxTalosVirtualMachineProps {
    readonly name: string;
    readonly vmid?: number;
    readonly cores?: number;
    readonly sockets?: number;
    readonly memory?: number;
    readonly storage?: number;
    readonly vlanTag?: number;
    readonly pause?: string;
}

export class ProxmoxTalosVirtualMachine extends Construct implements ITerraformDependable {

    public readonly vmQemu: proxmox.vmQemu.VmQemu;
    public readonly fqn: string;

    constructor(scope: Construct, name: string, props: ProxmoxTalosVirtualMachineProps ) {
        super(scope, name);

        this.vmQemu = new proxmox.vmQemu.VmQemu(this, name, {
            targetNode: 'proxmox',
            name: props.name,
            vmid: props.vmid,
            cores: props.cores ?? 2,
            sockets: props.sockets ?? 1,
            onboot: true,
            oncreate: true,
            automaticReboot: true,
            iso: 'local:iso/talos-amd64-v1.2.3.iso',
            memory: (props.memory ?? 4)*1024,
            cpu: 'kvm64',
            boot: 'order=scsi0;ide2',
            args: '-cpu kvm64,+cx16,+lahf_lm,+popcnt,+sse3,+ssse3,+sse4.1,+sse4.2',
            scsihw: 'virtio-scsi-pci',
            network: [
              {
                model: 'e1000',
                bridge: 'vmbr0',
                tag: props.vlanTag ?? 100,
              }
            ],
            disk: [
              {
                size: `${props.storage ?? 10}G`,
                storage: 'local-lvm',
                type: 'scsi'
              }
            ],
        });

        

        /**
        * Implement pause logic
        */

        if ( props.pause !== undefined ) {
            new time.provider.TimeProvider(this, 'ProviderTime4Pause');
            const sleepAfterVmCreate = new sleep.Sleep(this, 'Pause', {
                createDuration: '3m',
                dependsOn: [ this.vmQemu ],
            });
            this.fqn = sleepAfterVmCreate.fqn;
        } else {
            this.fqn = this.vmQemu.fqn;
        }    
        
    }

    getMacAddress() {
        return this.vmQemu.network.get(0).macaddr;
    }
}