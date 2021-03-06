import { Request, Response } from 'express';
import { AssetUtil, AssetFile } from '@travetto/asset';
import { ControllerRegistry } from '@travetto/express';
import { AssetExpressConfig } from '../config';
import { Class } from '@travetto/registry';
import * as util from 'util';

const match = require('mime-match');
const multiparty = require('connect-multiparty');

function readTypeArr(arr?: string[] | string) {
  return (Array.isArray(arr) ? arr : (arr || '').split(',')).filter(x => !!x);
}

function matchType(types: string[], type: string, invert: boolean = false) {
  if (types.length) {
    const matches = types.filter(match(type));
    return invert ? matches.length === 0 : matches.length > 0;
  }
  return false;
}

export function AssetUpload(config: Partial<AssetExpressConfig> = {}) {
  const conf = new AssetExpressConfig();
  (conf as any).postConstruct(); // Load config manually, bypassing dep-inj

  config = { ...conf, ...config };

  const multipart = multiparty({
    hash: 'sha256',
    maxFilesSize: config.maxSize
  });

  const multipartAsync = util.promisify(multipart);

  const allowedTypes = readTypeArr(config.allowedTypes);
  const excludeTypes = readTypeArr(config.excludeTypes);

  return (target: Object, propertyKey: string, descriptor: TypedPropertyDescriptor<any>) => {
    const rh = ControllerRegistry.getOrCreateRequestHandlerConfig(target.constructor as Class, descriptor.value);
    const filt = async function (this: any, req: Request, res: Response) {
      await multipartAsync(req, res);

      for (const f of Object.keys(req.files)) {
        const contentType = (await AssetUtil.detectFileType(req.files[f].path)).mime;

        if (matchType(allowedTypes, contentType, true) || matchType(excludeTypes, contentType)) {
          throw { message: `Content type not allowed: ${contentType}`, status: 403 };
        }

        req.files[f] = AssetUtil.fileToAsset(req.files[f] as any as AssetFile, `${(target.constructor as any).basePath}/`);
      }
    };

    rh.filters!.unshift(filt);
    return descriptor;
  };
}