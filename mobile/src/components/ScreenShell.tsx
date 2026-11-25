import React from 'react';
import {
  View,
  KeyboardAvoidingView,
  Platform,
  StatusBar,
  useWindowDimensions,
  StyleProp,
  ViewStyle,
} from 'react-native';
import {
  SafeAreaProvider,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';

export function useResponsiveLayout() {
  const { width, height } = useWindowDimensions();
  const isSmallPhone = width < 365;
  const isTablet = width >= 700;
  const maxContentWidth = isTablet ? Math.min(width, 680) : width;
  const horizontalPad = isSmallPhone ? 10 : 14;
  const innerWidth = Math.max(280, maxContentWidth - horizontalPad * 2);
  const cols = isTablet ? 3 : 2;
  const summaryCardWidth = Math.floor((innerWidth - (cols - 1) * 10) / cols);
  // 7 calendar cells inside a card (card padding 12*2 = 24, 6 gaps of 4px = 24)
  const calCellSize = Math.floor((innerWidth - 26 - 24) / 7);

  return {
    width,
    height,
    isSmallPhone,
    isTablet,
    maxContentWidth,
    horizontalPad,
    innerWidth,
    summaryCardWidth,
    calCellSize,
  };
}

const SafeInner: React.FC<{
  backgroundColor: string;
  includeBottom?: boolean;
  withKeyboardAvoid?: boolean;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
}> = ({
  backgroundColor,
  includeBottom = true,
  withKeyboardAvoid = true,
  style,
  children,
}) => {
  const insets = useSafeAreaInsets();
  const { isTablet, maxContentWidth } = useResponsiveLayout();

  // Guaranteed safe top inset for iPhone SE, iPhone 13 Pro (47pt notch),
  // iPhone 14/15/16 Pro Dynamic Island (59pt), and Android status bars
  const minTop = Platform.OS === 'ios' ? 48 : StatusBar.currentHeight || 26;
  const topPad = Math.max(insets.top, minTop) + 4;
  const bottomPad = includeBottom
    ? Math.max(insets.bottom, Platform.OS === 'ios' ? 14 : 8)
    : 0;

  const content = (
    <View
      style={[
        {
          flex: 1,
          backgroundColor,
          paddingTop: topPad,
          paddingBottom: bottomPad,
          paddingLeft: insets.left,
          paddingRight: insets.right,
        },
        style,
      ]}
    >
      <View
        style={{
          flex: 1,
          width: '100%',
          maxWidth: isTablet ? maxContentWidth : undefined,
          alignSelf: 'center',
        }}
      >
        {children}
      </View>
    </View>
  );

  if (!withKeyboardAvoid) return content;

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {content}
    </KeyboardAvoidingView>
  );
};

/**
 * Universal Safe Screen Shell that works both on the root screen AND inside any
 * React Native <Modal> (which mounts in a separate UIWindow on iOS).
 */
export const SafeScreen: React.FC<{
  backgroundColor: string;
  includeBottom?: boolean;
  withKeyboardAvoid?: boolean;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
}> = (props) => (
  <SafeAreaProvider>
    <SafeInner {...props} />
  </SafeAreaProvider>
);
