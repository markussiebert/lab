# Install the proxmox-csi to use proxmox volumes in k8s

https://github.com/sergelogvinov/proxmox-csi-plugin

# Run this on proxmox to create credentials

```bash
root@pve:~# pveum role add CSI -privs "VM.Audit VM.Config.Disk Datastore.Allocate Datastore.AllocateSpace Datastore.Audit"
root@pve:~# pveum user add kubernetes-csi@pve
pveum aclmod / -user kubernetes-csi@pve -role CSI
pveum user token add kubernetes-csi@pve csi -privsep 0
```