helm template cilium cilium/cilium \
    --version $1 \
    --namespace kube-system \
    --set ipam.mode=kubernetes \
    --set kubeProxyReplacement=strict \
    --set k8sServiceHost=$2 \
    --set hubble.relay.enabled=true \
    --set hubble.ui.enabled=true \
    --set k8sServicePort=$3 > cilium-manifest.yaml

kustomize build -o final-cilium-manifest.yaml