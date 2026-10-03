export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  message?: string;
  error?: {
    code: string;
    message: string;
  };
}

export const sendSuccess = <T>(data: T, message?: string): ApiResponse<T> => {
  return {
    success: true,
    data,
    message
  };
};

export const sendError = (code: string, message: string): ApiResponse => {
  return {
    success: false,
    error: {
      code,
      message
    }
  };
};
