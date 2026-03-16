VERSION ?= latest
DOCKER_REPOSITORY ?= wedigcode
PACKAGE_NAME ?= aura

.PHONY: docker-build
docker-build:
	# Local builds only map to the machine's architecture for quick testing
	docker build -t $(DOCKER_REPOSITORY)/$(PACKAGE_NAME):latest -t $(DOCKER_REPOSITORY)/$(PACKAGE_NAME):$(VERSION) .
	@echo "Ready to push! Run: make docker-publish VERSION=$(VERSION)"

.PHONY: docker-publish
docker-publish:
	# Buildx push automatically compiles for standard servers (amd64) AND Mac/Linux ARM (arm64) natively
	docker buildx create --use || true
	docker buildx build --platform linux/amd64,linux/arm64 -t $(DOCKER_REPOSITORY)/$(PACKAGE_NAME):latest -t $(DOCKER_REPOSITORY)/$(PACKAGE_NAME):$(VERSION) --push .
