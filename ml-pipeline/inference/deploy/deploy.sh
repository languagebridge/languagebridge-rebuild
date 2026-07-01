#!/bin/bash
# Deploy LanguageBridge TTS Inference Service to Azure Container Apps
# Usage: bash deploy/deploy.sh
set -e

RESOURCE_GROUP="lb-prod"
REGISTRY="lbacr.azurecr.io"
IMAGE="lb-tts"
TAG="latest"
APP_NAME="lb-tts-inference"
ENV_NAME="lb-tts-env"
LOCATION="eastus"

echo "═══════════════════════════════════════════════"
echo "  Deploying LanguageBridge TTS Inference"
echo "═══════════════════════════════════════════════"

# 1. Build Docker image
echo ""
echo "── Building image ──"
docker build -t $REGISTRY/$IMAGE:$TAG -f Dockerfile ..

# 2. Push to ACR
echo ""
echo "── Pushing to Azure Container Registry ──"
az acr login --name lbacr
docker push $REGISTRY/$IMAGE:$TAG

# 3. Create or update Container App
echo ""
echo "── Deploying Container App ──"
az containerapp up \
  --name $APP_NAME \
  --resource-group $RESOURCE_GROUP \
  --environment $ENV_NAME \
  --location $LOCATION \
  --image $REGISTRY/$IMAGE:$TAG \
  --target-port 8000 \
  --ingress external \
  --min-replicas 0 \
  --max-replicas 3 \
  --cpu 2.0 \
  --memory 4Gi

# 4. Get the URL
echo ""
echo "── Getting service URL ──"
URL=$(az containerapp show --name $APP_NAME --resource-group $RESOURCE_GROUP --query "properties.configuration.ingress.fqdn" -o tsv)
echo ""
echo "═══════════════════════════════════════════════"
echo "  Deployed: https://$URL"
echo ""
echo "  Next: Set this in Azure Function config:"
echo "  LB_TTS_SERVICE_URL=https://$URL"
echo "═══════════════════════════════════════════════"
