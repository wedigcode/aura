VERSION ?= latest
DOCKER_REPOSITORY ?= wedigcode
PACKAGE_NAME ?= aura

.PHONY: docker-build
docker-build:
	DOCKER_BUILDKIT=1 docker build --platform linux/amd64 -t $(DOCKER_REPOSITORY)/$(PACKAGE_NAME):latest -t $(DOCKER_REPOSITORY)/$(PACKAGE_NAME):$(VERSION) .
	@echo "Ready to push! Run: make docker-push VERSION=$(VERSION)"

.PHONY: docker-push
docker-push:
	docker push $(DOCKER_REPOSITORY)/$(PACKAGE_NAME):latest
	docker push $(DOCKER_REPOSITORY)/$(PACKAGE_NAME):$(VERSION)
