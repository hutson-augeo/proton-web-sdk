SRC_FILES := $(shell find src -name '*.ts' -or -name '*.svelte')
BIN := ./node_modules/.bin

all: lib

lib: ${SRC_FILES} package.json tsconfig.json node_modules rollup.config.js
	@${BIN}/rollup -c && touch lib

.PHONY: lint
lint: node_modules
	@${BIN}/eslint src --ext .ts --fix

node_modules:
	pnpm install --frozen-lockfile --ignore-scripts

.PHONY: clean
clean:
	rm -rf lib/

.PHONY: distclean
distclean: clean
	rm -rf node_modules/
