import type { Plugin } from "vite";
import { native } from "../shared/native";
import { resolveStyleLayer, transformStyleLayerImports } from "../core";
import type { StyleLayerTransformConfig } from "../core/types";

const styleFilePattern =
  /\.(?:css|scss|sass|less|styl|stylus|pcss|postcss)(?:\?.*)?$/i;

export const StyleLayerPluginVite = (
  config: StyleLayerTransformConfig = {},
): Plugin => {
  return {
    name: "vite-plugin-style-layer",
    enforce: config.enforce ?? "pre",
    transform(code, id) {
      if (!styleFilePattern.test(id)) return null;
      const transformStyleCode = (importsCode: string) => {
        const layer = resolveStyleLayer(config, id, importsCode);
        if (!layer) {
          return importsCode === code ? null : { code: importsCode, map: null };
        }
        const transformedCode = native.transformStyleLayer(
          importsCode,
          layer.layerName,
          layer.skipIfLayerExists,
          layer.importLayer,
        );
        return transformedCode === code
          ? null
          : { code: transformedCode, map: null };
      };

      if (native.getStyleLayerImportTargets(code).length > 0) {
        return transformStyleLayerImports(
          config,
          id,
          code,
          async (request, importer) => {
            const resolved = await this.resolve(request, importer, {
              skipSelf: true,
            });
            return resolved && !resolved.external ? resolved.id : undefined;
          },
        ).then(transformStyleCode);
      }

      return transformStyleCode(code);
    },
  };
};
