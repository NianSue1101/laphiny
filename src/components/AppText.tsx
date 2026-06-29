import { Text as NativeText, TextInput as NativeTextInput, type TextInputProps, type TextProps } from 'react-native';

let appTextFontFamily: string | undefined;

export function setAppTextFontFamily(fontFamily: string | undefined) {
  appTextFontFamily = fontFamily;
}

export function AppText(props: TextProps) {
  const style = appTextFontFamily ? [props.style, { fontFamily: appTextFontFamily }] : props.style;
  return <NativeText {...props} style={style} />;
}

export function AppTextInput(props: TextInputProps) {
  const style = appTextFontFamily ? [props.style, { fontFamily: appTextFontFamily }] : props.style;
  return <NativeTextInput {...props} style={style} />;
}
