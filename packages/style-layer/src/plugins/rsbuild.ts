import { dirname } from "node:path";
import type { RsbuildPlugin } from "@rsbuild/core";
import { native } from "../shared/native";
import { resolveStyleLayer, transformStyleLayerImports } from "../core";
import type { StyleLayerTransformConfig } from "../core/types";

const styleFilePattern =
  /\.(?:css|scss|sass|less|styl|stylus|pcss|postcss)(?:\?.*)?$/i;

export const StyleLayerRsbuild = (
  config: StyleLayerTransformConfig = {},
): RsbuildPlugin => ({
  name: "rsbuild-plugin-style-layer",
  setup(api) {
    api.transform(
      {
        test: styleFilePattern,
        order: config.enforce ?? "pre",
      },
      async ({ code, resourcePath, resolve }) => {
        let transformedCode = await transformStyleLayerImports(
          config,
          resourcePath,
          code,
          (request, importer) =>
            new Promise<string | undefined>((resolveResult, reject) => {
              resolve(dirname(importer), request, (error, result) => {
                if (error) {
                  reject(error);
                } else {
                  resolveResult(
                    typeof result === "string" ? result : undefined,
                  );
                }
              });
            }),
        );
        const layer = resolveStyleLayer(config, resourcePath, transformedCode);
        if (layer) {
          transformedCode = native.transformStyleLayer(
            transformedCode,
            layer.layerName,
            layer.skipIfLayerExists,
            layer.importLayer,
          );
        }
        return transformedCode === code
          ? code
          : { code: transformedCode, map: null };
      },
    );
  },
});
