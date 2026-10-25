// Narrow build-time port for the pinned Three.js 0.186.1. No fake DOM globals.
// Unused loaders remain tree-shaken; every new browser API fails the output guard.
export function threeDouyin() {
  return {
    name: 'three-douyin-native-factories',
    transform(source, id) {
      const path = id.replaceAll('\\', '/');
      if (path.endsWith('/three/build/three.core.js')) {
        const factory = "return document.createElementNS( 'http://www.w3.org/1999/xhtml', name );";
        if (!source.includes(factory)) throw new Error('Three.js factory changed: review the Douyin port before upgrading');
        source = source.replace(factory, `if (name === 'canvas') { const canvas = tt.createCanvas(); canvas.style ??= {}; return canvas; }
          if (name === 'img') return tt.createImage();
          throw new Error('Unsupported Three.js platform element: ' + name);`);
        const registration = source.lastIndexOf("if ( typeof __THREE_DEVTOOLS__ !== 'undefined' )");
        const exports = source.indexOf('\nexport {', registration);
        if (registration < 0 || exports < 0) throw new Error('Three.js registration changed');
        source = source.slice(0, registration) + source.slice(exports);
        return { code: source, map: null };
      }
      if (path.endsWith('/three/build/three.module.js')) {
        const browserFlag = "const supportsInvalidateFramebuffer = typeof navigator === 'undefined' ? false : /OculusBrowser/g.test( navigator.userAgent );";
        if (!source.includes(browserFlag)) throw new Error('Three.js browser feature check changed');
        return { code: source.replace(browserFlag, 'const supportsInvalidateFramebuffer = false;'), map: null };
      }
    },
  };
}
