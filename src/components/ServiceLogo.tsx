import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { Image } from 'expo-image';
import { fonts, makeStyles, size as sizes } from '../theme';

// Company logo with a lettered fallback.
//
// Sources, in order (see src/utils/logos.ts):
//   1. ToS;DR's logo for rated services (logos.tosdr.org/<id>.png).
//   2. The icon the company's own homepage declares, found during a direct
//      check (apple-touch-icon preferred).
//   3. A tile with the service's first letter, when there is no URL or the
//      image fails to load.
// Deliberately NOT used: third-party favicon services (Google s2,
// DuckDuckGo ip3). They would learn every app the user follows.
//
// Logos are the companies' own trademarks, shown only to identify the
// service. Never recolour, crop or redraw them.

const SIZES = { sm: sizes.logoSm, md: sizes.logoMd, lg: sizes.logoLg } as const;
// Corners follow the phone's own app-icon proportions.
const RADII = { sm: 7, md: 9, lg: 13 } as const;

export function ServiceLogo({
  name,
  uri,
  size = 'md',
}: {
  name: string;
  uri?: string | null;
  size?: keyof typeof SIZES;
}): React.JSX.Element {
  const styles = useStyles();
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [uri]);

  const px = SIZES[size];
  const box = { width: px, height: px, borderRadius: RADII[size] };

  if (!uri || failed) {
    const letter = name.trim().charAt(0).toUpperCase() || '?';
    return (
      <View style={[styles.tile, box]} accessibilityLabel={`${name} logo`}>
        <Text style={[styles.letter, { fontSize: Math.round(px * 0.45) }]}>{letter}</Text>
      </View>
    );
  }

  return (
    <View style={[styles.frame, box]}>
      <Image
        source={{ uri }}
        style={styles.image}
        contentFit="contain"
        cachePolicy="disk"
        recyclingKey={uri}
        transition={120}
        accessibilityLabel={`${name} logo`}
        onError={() => setFailed(true)}
      />
    </View>
  );
}

const useStyles = makeStyles(({ c }) => ({
  frame: {
    backgroundColor: c.logoGround,
    overflow: 'hidden',
  },
  image: {
    height: '100%',
    width: '100%',
  },
  letter: {
    color: c.ink,
    fontFamily: fonts.textBold,
  },
  tile: {
    alignItems: 'center',
    backgroundColor: c.surfaceSunk,
    justifyContent: 'center',
  },
}));
